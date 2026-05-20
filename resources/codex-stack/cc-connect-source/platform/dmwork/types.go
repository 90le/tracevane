package dmwork

// ChannelType mirrors the DMWork channel type enum.
type ChannelType int

const (
	ChannelTypeDM             ChannelType = 1
	ChannelTypeGroup          ChannelType = 2
	ChannelTypeCommunityTopic ChannelType = 5
)

// MessageType mirrors the DMWork message content type enum.
type MessageType int

const (
	MessageTypeText           MessageType = 1
	MessageTypeImage          MessageType = 2
	MessageTypeGIF            MessageType = 3
	MessageTypeVoice          MessageType = 4
	MessageTypeVideo          MessageType = 5
	MessageTypeLocation       MessageType = 6
	MessageTypeCard           MessageType = 7
	MessageTypeFile           MessageType = 8
	MessageTypeMultipleForward MessageType = 11
)

// WSPacketType represents WuKongIM binary packet types.
type WSPacketType int

const (
	PacketReserved   WSPacketType = 0
	PacketConnect    WSPacketType = 1
	PacketConnack    WSPacketType = 2
	PacketSend       WSPacketType = 3
	PacketSendack    WSPacketType = 4
	PacketRecv       WSPacketType = 5
	PacketRecvack    WSPacketType = 6
	PacketPing       WSPacketType = 7
	PacketPong       WSPacketType = 8
	PacketDisconnect WSPacketType = 9
)

// BotCredentials holds the result from /v1/bot/register.
type BotCredentials struct {
	RobotID string `json:"robot_id"`
	IMToken string `json:"im_token"`
	WsURL   string `json:"ws_url"`
}

// WSMessage represents a decoded inbound message from WuKongIM.
type WSMessage struct {
	MessageID   string      `json:"message_id"`
	MessageSeq  int         `json:"message_seq"`
	FromUID     string      `json:"from_uid"`
	ChannelID   string      `json:"channel_id"`
	ChannelType ChannelType `json:"channel_type"`
	Timestamp   int         `json:"timestamp"`
	Payload     WSPayload   `json:"payload"`
}

// WSPayload represents the decrypted message payload.
type WSPayload struct {
	Type    MessageType    `json:"type"`
	Content string         `json:"content,omitempty"`
	URL     string         `json:"url,omitempty"`
	Name    string         `json:"name,omitempty"`
	Size    int64          `json:"size,omitempty"`
	Width   int            `json:"width,omitempty"`
	Height  int            `json:"height,omitempty"`
	Mention *WSPayloadMention `json:"mention,omitempty"`
	Reply   *WSPayloadReply   `json:"reply,omitempty"`
}

// WSPayloadMention holds mention info in a message payload.
type WSPayloadMention struct {
	UIDs []string `json:"uids,omitempty"`
	All  int      `json:"all,omitempty"`
}

// WSPayloadReply holds reply info in a message payload.
type WSPayloadReply struct {
	MessageID string `json:"message_id"`
}

// UploadCredentials holds STS credentials from /v1/bot/upload/credentials.
type UploadCredentials struct {
	Bucket      string              `json:"bucket"`
	Region      string              `json:"region"`
	Key         string              `json:"key"`
	CDNBaseURL  string              `json:"cdnBaseUrl"`
	StartTime   int64               `json:"startTime"`
	ExpiredTime int64               `json:"expiredTime"`
	Credentials STSCredentials      `json:"credentials"`
}

// STSCredentials holds temporary COS credentials.
type STSCredentials struct {
	TmpSecretID  string `json:"tmpSecretId"`
	TmpSecretKey string `json:"tmpSecretKey"`
	SessionToken string `json:"sessionToken"`
}

// SendTextParams holds parameters for sending a text message.
type SendTextParams struct {
	APIURL      string
	BotToken    string
	ChannelID   string
	ChannelType ChannelType
	Content     string
	MentionUIDs []string
}

// SendMediaParams holds parameters for sending a media message.
type SendMediaParams struct {
	APIURL      string
	BotToken    string
	ChannelID   string
	ChannelType ChannelType
	Type        MessageType
	URL         string
	Name        string
	Size        int64
	Width       int
	Height      int
}

// replyContext holds the context needed to reply to a message.
type replyContext struct {
	channelID   string
	channelType ChannelType
	senderUID   string
	// Group member mapping for @mention resolution (uid -> name)
	uidNameMap map[string]string
	// Bot UIDs in this group (for FormattingInstructions)
	botUIDs    []string
}

// WSSetting represents parsed message setting bits.
type WSSetting struct {
	ReceiptEnabled bool
	Topic          bool
	StreamOn       bool
}

func parseSettingByte(v byte) WSSetting {
	return WSSetting{
		ReceiptEnabled: (v>>7)&0x01 > 0,
		Topic:          (v>>3)&0x01 > 0,
		StreamOn:       (v>>1)&0x01 > 0,
	}
}

// HistoryMessage represents a message from the history API.
type HistoryMessage struct {
	FromUID   string      `json:"from_uid"`
	MessageID string      `json:"message_id"`
	Timestamp int64       `json:"timestamp"`
	Type      MessageType `json:"type"`
	Content   string      `json:"content,omitempty"`
	URL       string      `json:"url,omitempty"`
	Name      string      `json:"name,omitempty"`
}

// GroupMember represents a member in a group.
type GroupMember struct {
	UID      string `json:"uid"`
	Name     string `json:"name"`
	Role     int    `json:"role"`     // 1 = owner, 0 = member
	Robot    int    `json:"robot"`    // 1 = bot
	OwnerUID string `json:"owner_uid,omitempty"`
}

// UserInfo represents a user's info.
type UserInfo struct {
	UID    string `json:"uid"`
	Name   string `json:"name"`
	Avatar string `json:"avatar,omitempty"`
}
