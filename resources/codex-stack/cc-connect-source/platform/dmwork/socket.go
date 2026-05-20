package dmwork

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/md5"
	"crypto/rand"
	mathrand "math/rand/v2"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"golang.org/x/crypto/curve25519"
	"github.com/gorilla/websocket"
)

const protoVersion = 4

// SocketHandler receives events from the WuKongIM WebSocket.
type SocketHandler interface {
	OnMessage(msg *WSMessage)
	OnConnected()
	OnDisconnected()
	OnError(err error)
}

// WKSocket implements the WuKongIM binary WebSocket protocol.
type WKSocket struct {
	wsURL    string
	uid      string
	token    string
	handler  SocketHandler
	ws       *websocket.Conn
	connected bool

	mu sync.Mutex

	// Per-connection crypto state
	dhPrivateKey  []byte
	aesKey        string
	aesIV         string
	serverVersion byte

	// Heartbeat
	heartTimer  *time.Timer
	heartCancel chan struct{}

	// Reconnect
	needReconnect    bool
	reconnectTimer   *time.Timer
	stopOnce         sync.Once
	stopCh           chan struct{}
}

// NewWKSocket creates a new WuKongIM WebSocket client.
func NewWKSocket(wsURL, uid, token string, handler SocketHandler) *WKSocket {
	return &WKSocket{
		wsURL:         wsURL,
		uid:           uid,
		token:         token,
		handler:       handler,
		needReconnect: true,
		stopCh:        make(chan struct{}),
	}
}

// UpdateCredentials changes the uid and token for reconnection.
func (s *WKSocket) UpdateCredentials(uid, token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.uid = uid
	s.token = token
}

// Connect starts the WebSocket connection.
func (s *WKSocket) Connect() {
	s.needReconnect = true
	s.doConnect()
}

// Disconnect gracefully closes the WebSocket.
func (s *WKSocket) Disconnect() {
	s.needReconnect = false
	s.connected = false
	s.stopHeart()
	s.stopReconnectTimer()
	s.stopOnce.Do(func() { close(s.stopCh) })
	if s.ws != nil {
		s.ws.Close()
		s.ws = nil
	}
}

func (s *WKSocket) doConnect() {
	s.mu.Lock()
	s.stopHeart()
	s.stopReconnectTimer()
	if s.ws != nil {
		s.ws.Close()
		s.ws = nil
	}
	s.mu.Unlock()

	dialer := websocket.DefaultDialer
	ws, _, err := dialer.Dial(s.wsURL, http.Header{})
	if err != nil {
		slog.Error("dmwork: WS dial failed", "error", err)
		s.handler.OnError(fmt.Errorf("WS dial: %w", err))
		s.scheduleReconnect()
		return
	}

	s.mu.Lock()
	s.ws = ws
	s.mu.Unlock()

	// Generate DH key pair using curve25519
	var seed [32]byte
	rand.Read(seed[:])
	dhPrivateKey := seed
	// curve25519 ScalarBaseMult: clamp the private key
	dhPrivateKey[0] &= 248
	dhPrivateKey[31] &= 127
	dhPrivateKey[31] |= 64
	dhPublicKey, err := curve25519.X25519(dhPrivateKey[:], curve25519.Basepoint)
	if err != nil {
		slog.Error("dmwork: DH key generation failed", "error", err)
		ws.Close()
		s.scheduleReconnect()
		return
	}
	s.dhPrivateKey = dhPrivateKey[:]

	deviceID := generateDeviceID()
	pubKeyB64 := base64.StdEncoding.EncodeToString(dhPublicKey)

	// Encode CONNECT packet
	connectPacket := encodeConnectPacket(protoVersion, 0, deviceID, s.uid, s.token, time.Now().UnixMilli(), pubKeyB64)
	if err := ws.WriteMessage(websocket.BinaryMessage, connectPacket); err != nil {
		slog.Error("dmwork: send CONNECT failed", "error", err)
		ws.Close()
		s.scheduleReconnect()
		return
	}

	// Start reading loop
	go s.readLoop()
}

func (s *WKSocket) readLoop() {
	defer func() {
		if s.connected {
			s.connected = false
			s.handler.OnDisconnected()
		}
		s.stopHeart()
		if s.needReconnect {
			s.scheduleReconnect()
		}
	}()

	for {
		select {
		case <-s.stopCh:
			return
		default:
		}

		s.mu.Lock()
		ws := s.ws
		s.mu.Unlock()
		if ws == nil {
			return
		}

		_, data, err := ws.ReadMessage()
		if err != nil {
			slog.Debug("dmwork: WS read error", "error", err)
			return
		}

		s.handleRawData(data)
	}
}

func (s *WKSocket) handleRawData(data []byte) {
	if len(data) == 0 {
		return
	}

	packetType := WSPacketType(data[0] >> 4)
	flags := data[0] & 0x0F

	// PONG is a single byte
	if packetType == PacketPong {
		s.mu.Lock()
		s.resetHeartTimer()
		s.mu.Unlock()
		return
	}

	// PING from server — send PONG back
	if packetType == PacketPing {
		s.sendRaw([]byte{byte(PacketPong << 4)})
		return
	}

	// Parse remaining length (variable-length encoding)
	_, offset := decodeVariableLength(data[1:])
	bodyStart := 1 + offset
	if bodyStart >= len(data) {
		return
	}
	body := data[bodyStart:]

	switch packetType {
	case PacketConnack:
		hasServerVersion := flags&0x01 != 0
		s.onConnack(body, hasServerVersion)
	case PacketRecv:
		noPersist := flags&0x01 != 0
		_ = noPersist
		reddot := flags&0x02 != 0
		_ = reddot
		s.onRecv(body)
	case PacketDisconnect:
		s.onDisconnect(body)
	case PacketSendack:
		// Not used for bot — ignore
	}
}

func (s *WKSocket) onConnack(body []byte, hasServerVersion bool) {
	dec := newDecoder(body)

	if hasServerVersion {
		s.serverVersion, _ = dec.readByte()
	}
	_, _ = dec.readInt64() // timeDiff
	reasonCode, _ := dec.readByte()
	serverKey, _ := dec.readString()
	salt, _ := dec.readString()

	if s.serverVersion >= 4 {
		_, _ = dec.readInt64() // nodeId
	}

	if reasonCode == 1 {
		// Success — derive AES key from DH shared secret
		serverPubKey, err := base64.StdEncoding.DecodeString(serverKey)
		if err != nil {
			slog.Error("dmwork: decode server key failed", "error", err)
			return
		}
		sharedSecret, err := curve25519.X25519(s.dhPrivateKey, serverPubKey)
		if err != nil {
			slog.Error("dmwork: DH shared key failed", "error", err)
			return
		}
		secretBase64 := base64.StdEncoding.EncodeToString(sharedSecret)
		aesKeyFull := fmt.Sprintf("%x", md5.Sum([]byte(secretBase64)))
		s.aesKey = aesKeyFull[:16]
		if len(salt) > 16 {
			s.aesIV = salt[:16]
		} else {
			s.aesIV = salt
		}

		s.connected = true
		s.startHeart()
		s.handler.OnConnected()
	} else if reasonCode == 0 {
		// Kicked
		s.connected = false
		s.needReconnect = false
		s.handler.OnError(fmt.Errorf("kicked by server"))
		s.handler.OnDisconnected()
	} else {
		s.connected = false
		s.needReconnect = false
		s.handler.OnError(fmt.Errorf("connect failed: reasonCode=%d", reasonCode))
	}
}

func (s *WKSocket) onRecv(body []byte) {
	dec := newDecoder(body)

	settingByte, _ := dec.readByte()
	setting := parseSettingByte(settingByte)

	_, _ = dec.readString() // msgKey
	fromUID, _ := dec.readString()
	channelID, _ := dec.readString()
	channelType, _ := dec.readByte()

	if s.serverVersion >= 3 {
		_, _ = dec.readInt32() // expire
	}

	_, _ = dec.readString() // clientMsgNo
	messageID, _ := dec.readString64()
	messageSeq, _ := dec.readInt32()
	timestamp, _ := dec.readInt32()

	if setting.Topic {
		_, _ = dec.readString() // topic
	}

	encryptedPayload := dec.readRemaining()

	// Send RECVACK
	ackPacket := encodeRecvackPacket(messageID, messageSeq)
	s.sendRaw(ackPacket)

	// Decrypt payload
	decrypted, err := aesDecryptCBC(encryptedPayload, []byte(s.aesKey), []byte(s.aesIV))
	if err != nil {
		slog.Debug("dmwork: payload decrypt error", "error", err)
		return
	}

	var payload WSPayload
	if err := json.Unmarshal(decrypted, &payload); err != nil {
		slog.Debug("dmwork: payload parse error", "error", err, "data", string(decrypted))
		return
	}

	msg := &WSMessage{
		MessageID:   messageID,
		MessageSeq:  int(messageSeq),
		FromUID:     fromUID,
		ChannelID:   channelID,
		ChannelType: ChannelType(channelType),
		Timestamp:   int(timestamp),
		Payload:     payload,
	}
	s.handler.OnMessage(msg)
}

func (s *WKSocket) onDisconnect(body []byte) {
	s.connected = false
	s.needReconnect = false
	s.stopHeart()
	s.handler.OnError(fmt.Errorf("kicked by server"))
	s.handler.OnDisconnected()
}

func (s *WKSocket) sendRaw(data []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ws != nil {
		s.ws.WriteMessage(websocket.BinaryMessage, data)
	}
}

// Heartbeat management
func (s *WKSocket) startHeart() {
	s.stopHeart()
	s.heartCancel = make(chan struct{})
	s.resetHeartTimer()
}

func (s *WKSocket) resetHeartTimer() {
	if s.heartTimer != nil {
		s.heartTimer.Stop()
	}
	s.heartTimer = time.AfterFunc(30*time.Second, func() {
		select {
		case <-s.heartCancel:
			return
		default:
		}
		s.sendRaw(encodePingPacket())
		// Wait for PONG, schedule another
		s.mu.Lock()
		s.heartTimer = time.AfterFunc(10*time.Second, func() {
			// No PONG received
			slog.Warn("dmwork: PONG timeout, reconnecting")
			s.mu.Lock()
			if s.ws != nil {
				s.ws.Close()
				s.ws = nil
			}
			s.connected = false
			s.mu.Unlock()
		})
		s.mu.Unlock()
	})
}

func (s *WKSocket) stopHeart() {
	if s.heartTimer != nil {
		s.heartTimer.Stop()
		s.heartTimer = nil
	}
	if s.heartCancel != nil {
		select {
		case <-s.heartCancel:
		default:
			close(s.heartCancel)
		}
		s.heartCancel = nil
	}
}

func (s *WKSocket) stopReconnectTimer() {
	if s.reconnectTimer != nil {
		s.reconnectTimer.Stop()
		s.reconnectTimer = nil
	}
}

func (s *WKSocket) scheduleReconnect() {
	if !s.needReconnect {
		return
	}
	delay := 3*time.Second + time.Duration(mathrand.IntN(3000))*time.Millisecond
	s.mu.Lock()
	s.stopReconnectTimer()
	s.reconnectTimer = time.AfterFunc(delay, func() {
		if s.needReconnect {
			slog.Info("dmwork: reconnecting...")
			s.doConnect()
		}
	})
	s.mu.Unlock()
}

// ─── Binary encoding helpers ────────────────────────────────────────────────

type encoder struct {
	buf []byte
}

func (e *encoder) writeByte(b byte) {
	e.buf = append(e.buf, b)
}

func (e *encoder) writeBytes(b []byte) {
	e.buf = append(e.buf, b...)
}

func (e *encoder) writeInt16(v int16) {
	e.buf = binary.BigEndian.AppendUint16(e.buf, uint16(v))
}

func (e *encoder) writeInt32(v int32) {
	e.buf = binary.BigEndian.AppendUint32(e.buf, uint32(v))
}

func (e *encoder) writeInt64(v int64) {
	e.buf = binary.BigEndian.AppendUint64(e.buf, uint64(v))
}

func (e *encoder) writeString(s string) {
	if len(s) > 0 {
		b := []byte(s)
		e.writeInt16(int16(len(b)))
		e.buf = append(e.buf, b...)
	} else {
		e.writeInt16(0)
	}
}

func encodeConnectPacket(version, deviceFlag byte, deviceID, uid, token string, clientTimestamp int64, clientKey string) []byte {
	body := &encoder{}
	body.writeByte(version)
	body.writeByte(deviceFlag)
	body.writeString(deviceID)
	body.writeString(uid)
	body.writeString(token)
	body.writeInt64(clientTimestamp)
	body.writeString(clientKey)

	bodyBytes := body.buf

	frame := &encoder{}
	frame.writeByte(byte(PacketConnect<<4) | 0)
	frame.writeBytes(encodeVariableLength(len(bodyBytes)))
	frame.writeBytes(bodyBytes)
	return frame.buf
}

func encodePingPacket() []byte {
	return []byte{byte(PacketPing << 4)}
}

func encodeRecvackPacket(messageID string, messageSeq int32) []byte {
	body := &encoder{}
	// messageID is an int64 stored as string
	var id int64
	fmt.Sscanf(messageID, "%d", &id)
	body.writeInt64(id)
	body.writeInt32(messageSeq)

	bodyBytes := body.buf

	frame := &encoder{}
	frame.writeByte(byte(PacketRecvack << 4) | 0)
	frame.writeBytes(encodeVariableLength(len(bodyBytes)))
	frame.writeBytes(bodyBytes)
	return frame.buf
}

func encodeVariableLength(length int) []byte {
	var ret []byte
	for length > 0 {
		digit := byte(length % 0x80)
		length /= 0x80
		if length > 0 {
			digit |= 0x80
		}
		ret = append(ret, digit)
	}
	if len(ret) == 0 {
		return []byte{0}
	}
	return ret
}

func decodeVariableLength(data []byte) (int, int) {
	var multiplier int
	var rLength int
	var offset int
	for multiplier < 27 && offset < len(data) {
		b := data[offset]
		offset++
		rLength |= int(b&0x7F) << multiplier
		if b&0x80 == 0 {
			break
		}
		multiplier += 7
	}
	return rLength, offset
}

// ─── Binary decoder ─────────────────────────────────────────────────────────

type decoder struct {
	data   []byte
	offset int
}

func newDecoder(data []byte) *decoder {
	return &decoder{data: data}
}

func (d *decoder) readByte() (byte, error) {
	if d.offset >= len(d.data) {
		return 0, fmt.Errorf("EOF")
	}
	b := d.data[d.offset]
	d.offset++
	return b, nil
}

func (d *decoder) readInt16() (int16, error) {
	if d.offset+2 > len(d.data) {
		return 0, fmt.Errorf("EOF")
	}
	v := int16(binary.BigEndian.Uint16(d.data[d.offset:]))
	d.offset += 2
	return v, nil
}

func (d *decoder) readInt32() (int32, error) {
	if d.offset+4 > len(d.data) {
		return 0, fmt.Errorf("EOF")
	}
	v := int32(binary.BigEndian.Uint32(d.data[d.offset:]))
	d.offset += 4
	return v, nil
}

func (d *decoder) readInt64() (int64, error) {
	if d.offset+8 > len(d.data) {
		return 0, fmt.Errorf("EOF")
	}
	v := int64(binary.BigEndian.Uint64(d.data[d.offset:]))
	d.offset += 8
	return v, nil
}

func (d *decoder) readString64() (string, error) {
	n, err := d.readInt64()
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%d", n), nil
}

func (d *decoder) readString() (string, error) {
	length, err := d.readInt16()
	if err != nil || length <= 0 {
		return "", err
	}
	if d.offset+int(length) > len(d.data) {
		return "", fmt.Errorf("EOF")
	}
	s := string(d.data[d.offset : d.offset+int(length)])
	d.offset += int(length)
	return s, nil
}

func (d *decoder) readRemaining() []byte {
	if d.offset >= len(d.data) {
		return nil
	}
	rem := d.data[d.offset:]
	d.offset = len(d.data)
	return rem
}

// ─── AES-CBC decryption ────────────────────────────────────────────────────

func aesDecryptCBC(data, key, iv []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("aes cipher: %w", err)
	}
	if len(data) == 0 {
		return nil, nil
	}
	// The data is base64-encoded ciphertext
	decoded := make([]byte, base64.StdEncoding.DecodedLen(len(data)))
	n, err := base64.StdEncoding.Decode(decoded, data)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}
	decoded = decoded[:n]

	if len(decoded)%aes.BlockSize != 0 {
		return nil, fmt.Errorf("ciphertext not multiple of block size")
	}

	mode := cipher.NewCBCDecrypter(block, iv)
	plaintext := make([]byte, len(decoded))
	mode.CryptBlocks(plaintext, decoded)

	// PKCS7 unpad
	padLen := int(plaintext[len(plaintext)-1])
	if padLen > aes.BlockSize || padLen == 0 {
		return plaintext, nil // no valid padding
	}
	return plaintext[:len(plaintext)-padLen], nil
}



func generateDeviceID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}
