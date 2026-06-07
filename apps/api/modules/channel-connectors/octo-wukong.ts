import crypto, { type KeyObject } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import type { ChannelConnectorOctoInboundMessage } from "../../../../types/channel-connectors.js";

const PROTO_VERSION = 4;
const PACKET_CONNECT = 1;
const PACKET_CONNACK = 2;
const PACKET_RECV = 5;
const PACKET_RECVACK = 6;
const PACKET_PING = 7;
const PACKET_PONG = 8;
const PACKET_DISCONNECT = 9;
const X25519_SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");
const DEFAULT_OCTO_HEARTBEAT_MS = 30_000;
const DEFAULT_OCTO_PONG_TIMEOUT_MS = 10_000;
const DEFAULT_OCTO_RECONNECT_MS = 3_000;
const DEFAULT_OCTO_RECONNECT_JITTER_MS = 3_000;

export interface OctoWukongLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface OctoWukongSocketOptions {
  bindingId: string;
  wsUrl: string;
  uid: string;
  token: string;
  reconnect?: boolean;
  heartbeatMs?: number;
  pongTimeoutMs?: number;
  reconnectMs?: number;
  reconnectJitterMs?: number;
  WebSocketCtor?: typeof WebSocket;
  logger?: OctoWukongLogger;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (message: ChannelConnectorOctoInboundMessage) => void;
}

export interface OctoWukongSocketStatus {
  bindingId: string;
  wsUrl: string;
  connected: boolean;
  state: "idle" | "connecting" | "connected" | "closed";
  lastError: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  reconnects: number;
  receivedMessages: number;
}

class BinaryWriter {
  private chunks: Uint8Array[] = [];

  writeByte(value: number): void {
    this.chunks.push(Buffer.from([value & 0xff]));
  }

  writeBytes(value: Uint8Array): void {
    this.chunks.push(value);
  }

  writeInt16(value: number): void {
    const buffer = Buffer.alloc(2);
    buffer.writeInt16BE(value, 0);
    this.chunks.push(buffer);
  }

  writeInt32(value: number): void {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(value, 0);
    this.chunks.push(buffer);
  }

  writeInt64(value: bigint): void {
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(value, 0);
    this.chunks.push(buffer);
  }

  writeString(value: string): void {
    const raw = Buffer.from(value, "utf8");
    this.writeInt16(raw.length);
    if (raw.length) this.writeBytes(raw);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

class BinaryReader {
  private offset = 0;

  constructor(private readonly data: Buffer) {}

  readByte(): number {
    if (this.offset >= this.data.length) throw new Error("Octo frame decode EOF");
    const value = this.data[this.offset];
    this.offset += 1;
    return value;
  }

  readInt16(): number {
    if (this.offset + 2 > this.data.length) throw new Error("Octo frame decode EOF");
    const value = this.data.readInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  readInt32(): number {
    if (this.offset + 4 > this.data.length) throw new Error("Octo frame decode EOF");
    const value = this.data.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  readInt64String(): string {
    if (this.offset + 8 > this.data.length) throw new Error("Octo frame decode EOF");
    const value = this.data.readBigInt64BE(this.offset);
    this.offset += 8;
    return value.toString();
  }

  readString(): string {
    const length = this.readInt16();
    if (length <= 0) return "";
    if (this.offset + length > this.data.length) throw new Error("Octo frame decode EOF");
    const value = this.data.subarray(this.offset, this.offset + length).toString("utf8");
    this.offset += length;
    return value;
  }

  readRemaining(): Buffer {
    const value = this.data.subarray(this.offset);
    this.offset = this.data.length;
    return value;
  }
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function packet(packetType: number, flags: number, body: Uint8Array = new Uint8Array()): Buffer {
  return Buffer.concat([
    Buffer.from([(packetType << 4) | (flags & 0x0f)]),
    encodeVariableLength(body.length),
    Buffer.from(body),
  ]);
}

function encodeVariableLength(length: number): Buffer {
  const output: number[] = [];
  let remaining = Math.max(0, Math.floor(length));
  do {
    let digit = remaining % 0x80;
    remaining = Math.floor(remaining / 0x80);
    if (remaining > 0) digit |= 0x80;
    output.push(digit);
  } while (remaining > 0);
  return Buffer.from(output);
}

function decodeVariableLength(data: Buffer, offset = 0): { length: number; bytesRead: number } {
  let multiplier = 0;
  let length = 0;
  let bytesRead = 0;
  while (multiplier < 27 && offset + bytesRead < data.length) {
    const digit = data[offset + bytesRead];
    bytesRead += 1;
    length |= (digit & 0x7f) << multiplier;
    if ((digit & 0x80) === 0) break;
    multiplier += 7;
  }
  return { length, bytesRead };
}

export function parseOctoWukongFrame(data: Buffer): { packetType: number; flags: number; body: Buffer } {
  if (!data.length) throw new Error("Octo frame is empty");
  const packetType = data[0] >> 4;
  const flags = data[0] & 0x0f;
  const decoded = decodeVariableLength(data, 1);
  const bodyStart = 1 + decoded.bytesRead;
  const bodyEnd = Math.min(data.length, bodyStart + decoded.length);
  return {
    packetType,
    flags,
    body: data.subarray(bodyStart, bodyEnd),
  };
}

function rawDataToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.from(data as unknown as ArrayBuffer);
}

function durationMs(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function rawPublicKey(publicKey: KeyObject): Buffer {
  const der = publicKey.export({ format: "der", type: "spki" });
  return Buffer.from(der).subarray(-32);
}

function publicKeyFromRaw(raw: Buffer): KeyObject {
  return crypto.createPublicKey({
    format: "der",
    type: "spki",
    key: Buffer.concat([X25519_SPKI_PREFIX, raw]),
  });
}

export function createOctoX25519KeyPair(): { privateKey: KeyObject; publicKeyRaw: Buffer; publicKeyBase64: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("x25519");
  const publicKeyRaw = rawPublicKey(publicKey);
  return {
    privateKey,
    publicKeyRaw,
    publicKeyBase64: publicKeyRaw.toString("base64"),
  };
}

function generateDeviceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function createSharedSecret(privateKey: KeyObject, serverPublicKeyBase64: string): Buffer {
  const serverRaw = Buffer.from(serverPublicKeyBase64, "base64");
  return crypto.diffieHellman({
    privateKey,
    publicKey: publicKeyFromRaw(serverRaw),
  });
}

function deriveAesState(privateKey: KeyObject, serverPublicKeyBase64: string, salt: string): { key: Buffer; iv: Buffer } {
  const sharedSecret = createSharedSecret(privateKey, serverPublicKeyBase64);
  const secretBase64 = sharedSecret.toString("base64");
  const keyHex = crypto.createHash("md5").update(secretBase64).digest("hex").slice(0, 16);
  const ivText = salt.length > 16 ? salt.slice(0, 16) : salt;
  return {
    key: Buffer.from(keyHex, "utf8"),
    iv: Buffer.from(ivText, "utf8"),
  };
}

export function encodeOctoConnectPacket(input: {
  uid: string;
  token: string;
  deviceId?: string;
  timestampMs?: number;
  clientPublicKeyBase64: string;
}): Buffer {
  const body = new BinaryWriter();
  body.writeByte(PROTO_VERSION);
  body.writeByte(0);
  body.writeString(input.deviceId || generateDeviceId());
  body.writeString(input.uid);
  body.writeString(input.token);
  body.writeInt64(BigInt(input.timestampMs || Date.now()));
  body.writeString(input.clientPublicKeyBase64);
  return packet(PACKET_CONNECT, 0, body.toBuffer());
}

export function decodeOctoConnectPacket(data: Buffer): {
  version: number;
  deviceFlag: number;
  deviceId: string;
  uid: string;
  token: string;
  timestampMs: string;
  clientPublicKeyBase64: string;
} {
  const frame = parseOctoWukongFrame(data);
  if (frame.packetType !== PACKET_CONNECT) throw new Error("Octo packet is not CONNECT");
  const reader = new BinaryReader(frame.body);
  return {
    version: reader.readByte(),
    deviceFlag: reader.readByte(),
    deviceId: reader.readString(),
    uid: reader.readString(),
    token: reader.readString(),
    timestampMs: reader.readInt64String(),
    clientPublicKeyBase64: reader.readString(),
  };
}

export function encodeOctoConnackPacket(input: {
  serverVersion?: number;
  reasonCode?: number;
  serverPublicKeyBase64: string;
  salt: string;
  nodeId?: bigint;
}): Buffer {
  const serverVersion = input.serverVersion ?? PROTO_VERSION;
  const body = new BinaryWriter();
  body.writeByte(serverVersion);
  body.writeInt64(0n);
  body.writeByte(input.reasonCode ?? 1);
  body.writeString(input.serverPublicKeyBase64);
  body.writeString(input.salt);
  if (serverVersion >= 4) body.writeInt64(input.nodeId ?? 1n);
  return packet(PACKET_CONNACK, 0x01, body.toBuffer());
}

export function encodeOctoPingPacket(): Buffer {
  return Buffer.from([PACKET_PING << 4]);
}

export function encodeOctoPongPacket(): Buffer {
  return Buffer.from([PACKET_PONG << 4]);
}

export function encodeOctoRecvackPacket(messageId: string, messageSeq: number): Buffer {
  const body = new BinaryWriter();
  let id = 0n;
  try {
    id = BigInt(messageId);
  } catch {
    id = 0n;
  }
  body.writeInt64(id);
  body.writeInt32(messageSeq);
  return packet(PACKET_RECVACK, 0, body.toBuffer());
}

function parseConnack(body: Buffer, hasServerVersion: boolean): {
  serverVersion: number;
  reasonCode: number;
  serverPublicKeyBase64: string;
  salt: string;
} {
  const reader = new BinaryReader(body);
  const serverVersion = hasServerVersion ? reader.readByte() : 0;
  reader.readInt64String();
  const reasonCode = reader.readByte();
  const serverPublicKeyBase64 = reader.readString();
  const salt = reader.readString();
  return {
    serverVersion,
    reasonCode,
    serverPublicKeyBase64,
    salt,
  };
}

function parseSettingByte(value: number): { topic: boolean } {
  return { topic: ((value >> 3) & 0x01) > 0 };
}

function decryptOctoPayload(encryptedPayload: Buffer, aesKey: Buffer, aesIv: Buffer): Buffer {
  const ciphertext = Buffer.from(encryptedPayload.toString("utf8"), "base64");
  const decipher = crypto.createDecipheriv("aes-128-cbc", aesKey, aesIv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function parseRecv(
  body: Buffer,
  serverVersion: number,
  aesKey: Buffer,
  aesIv: Buffer,
): { message: ChannelConnectorOctoInboundMessage; ack: Buffer } {
  const reader = new BinaryReader(body);
  const setting = parseSettingByte(reader.readByte());
  reader.readString();
  const fromUid = reader.readString();
  const channelId = reader.readString();
  const channelType = reader.readByte() as ChannelConnectorOctoInboundMessage["channelType"];
  if (serverVersion >= 3) reader.readInt32();
  reader.readString();
  const messageId = reader.readInt64String();
  const messageSeq = reader.readInt32();
  const timestamp = reader.readInt32();
  if (setting.topic) reader.readString();
  const decrypted = decryptOctoPayload(reader.readRemaining(), aesKey, aesIv);
  const payload = JSON.parse(decrypted.toString("utf8"));
  return {
    ack: encodeOctoRecvackPacket(messageId, messageSeq),
    message: {
      messageId,
      fromUid,
      channelId,
      channelType,
      timestamp,
      payload,
    },
  };
}

function noopLogger(): OctoWukongLogger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

export class OctoWukongSocket {
  private ws: WebSocket | null = null;
  private keyPair: { privateKey: KeyObject; publicKeyBase64: string } | null = null;
  private aesKey: Buffer | null = null;
  private aesIv: Buffer | null = null;
  private serverVersion = 0;
  private shouldReconnect: boolean;
  private state: OctoWukongSocketStatus["state"] = "idle";
  private lastError: string | null = null;
  private lastConnectedAt: string | null = null;
  private lastDisconnectedAt: string | null = null;
  private reconnects = 0;
  private receivedMessages = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly logger: OctoWukongLogger;

  constructor(private readonly options: OctoWukongSocketOptions) {
    this.shouldReconnect = options.reconnect !== false;
    this.logger = options.logger || noopLogger();
  }

  connect(): void {
    this.shouldReconnect = this.options.reconnect !== false;
    this.open();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearTimers();
    this.state = "closed";
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  status(): OctoWukongSocketStatus {
    return {
      bindingId: this.options.bindingId,
      wsUrl: this.options.wsUrl,
      connected: this.state === "connected",
      state: this.state,
      lastError: this.lastError,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      reconnects: this.reconnects,
      receivedMessages: this.receivedMessages,
    };
  }

  private open(): void {
    this.clearTimers();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.state = "connecting";
    const WebSocketCtor = this.options.WebSocketCtor || WebSocket;
    const ws = new WebSocketCtor(this.options.wsUrl);
    this.ws = ws;
    ws.on("open", () => this.onOpen());
    ws.on("message", (data) => this.onRawMessage(rawDataToBuffer(data)));
    ws.on("error", (error) => this.onError(error instanceof Error ? error : new Error(String(error))));
    ws.on("close", () => this.onClose());
  }

  private onOpen(): void {
    this.keyPair = createOctoX25519KeyPair();
    this.sendRaw(encodeOctoConnectPacket({
      uid: this.options.uid,
      token: this.options.token,
      clientPublicKeyBase64: this.keyPair.publicKeyBase64,
    }));
  }

  private onRawMessage(data: Buffer): void {
    if (!data.length) return;
    const singlePacket = data.length === 1 ? data[0] >> 4 : null;
    if (singlePacket === PACKET_PONG) {
      this.resetHeartbeat();
      return;
    }
    if (singlePacket === PACKET_PING) {
      this.sendRaw(encodeOctoPongPacket());
      return;
    }
    try {
      const frame = parseOctoWukongFrame(data);
      if (frame.packetType === PACKET_CONNACK) {
        this.handleConnack(frame.flags, frame.body);
        return;
      }
      if (frame.packetType === PACKET_RECV) {
        this.handleRecv(frame.body);
        return;
      }
      if (frame.packetType === PACKET_DISCONNECT) {
        this.onError(new Error("Octo WebSocket disconnected by server"));
        this.ws?.close();
      }
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleConnack(flags: number, body: Buffer): void {
    const keyPair = this.keyPair;
    if (!keyPair) throw new Error("Octo connack received before connect key exists");
    const connack = parseConnack(body, (flags & 0x01) !== 0);
    this.serverVersion = connack.serverVersion;
    if (connack.reasonCode === 0) {
      this.shouldReconnect = false;
      throw new Error("Octo WebSocket was kicked by server");
    }
    if (connack.reasonCode !== 1) {
      this.shouldReconnect = false;
      throw new Error(`Octo WebSocket connect failed: reasonCode=${connack.reasonCode}`);
    }
    const aesState = deriveAesState(keyPair.privateKey, connack.serverPublicKeyBase64, connack.salt);
    this.aesKey = aesState.key;
    this.aesIv = aesState.iv;
    this.state = "connected";
    this.lastError = null;
    this.lastConnectedAt = new Date().toISOString();
    this.resetHeartbeat();
    this.options.onConnected?.();
  }

  private handleRecv(body: Buffer): void {
    if (!this.aesKey || !this.aesIv) throw new Error("Octo recv received before AES state exists");
    const parsed = parseRecv(body, this.serverVersion, this.aesKey, this.aesIv);
    this.sendRaw(parsed.ack);
    this.receivedMessages += 1;
    this.options.onMessage?.(parsed.message);
  }

  private onClose(): void {
    const wasConnected = this.state === "connected";
    this.clearHeartbeat();
    this.ws = null;
    if (this.state !== "closed") this.state = "idle";
    if (wasConnected) {
      this.lastDisconnectedAt = new Date().toISOString();
      this.options.onDisconnected?.();
    }
    if (this.shouldReconnect) this.scheduleReconnect();
  }

  private onError(error: Error): void {
    this.lastError = error.message;
    this.logger.warn("Octo WebSocket error", {
      bindingId: this.options.bindingId,
      error: error.message,
    });
    this.options.onError?.(error);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delayMs = this.reconnectDelayMs();
    this.logger.info("Octo WebSocket reconnect scheduled", {
      bindingId: this.options.bindingId,
      delayMs,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnects += 1;
      this.open();
    }, delayMs);
  }

  private reconnectDelayMs(): number {
    const baseMs = durationMs(this.options.reconnectMs, DEFAULT_OCTO_RECONNECT_MS);
    const jitterMs = durationMs(this.options.reconnectJitterMs, DEFAULT_OCTO_RECONNECT_JITTER_MS);
    return baseMs + (jitterMs > 0 ? crypto.randomInt(0, jitterMs + 1) : 0);
  }

  private resetHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setTimeout(() => {
      this.sendRaw(encodeOctoPingPacket());
      this.pongTimer = setTimeout(() => {
        this.onError(new Error("Octo WebSocket PONG timeout"));
        this.ws?.terminate();
      }, durationMs(this.options.pongTimeoutMs, DEFAULT_OCTO_PONG_TIMEOUT_MS));
    }, durationMs(this.options.heartbeatMs, DEFAULT_OCTO_HEARTBEAT_MS));
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.heartbeatTimer = null;
    this.pongTimer = null;
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private sendRaw(data: Buffer): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(data);
  }
}

export function deriveOctoWsUrl(apiUrl: string): string | null {
  try {
    const url = new URL(apiUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function isUsableOctoCredential(input: {
  robotId?: string | null;
  imToken?: string | null;
  wsUrl?: string | null;
}): input is { robotId: string; imToken: string; wsUrl: string } {
  return Boolean(normalizeString(input.robotId) && normalizeString(input.imToken) && normalizeString(input.wsUrl));
}
