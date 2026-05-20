package dmwork

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/chenhg5/cc-connect/core"
)

const (
	sessionKeyPrefixDM    = "dmwork:dm:"
	sessionKeyPrefixGroup = "dmwork:group:"
	maxChunkSize          = 3800
)

func init() {
	core.RegisterPlatform("dmwork", New)
}

// Platform implements core.Platform for DMWork via WuKongIM WebSocket.
type Platform struct {
	botToken     string
	apiURL       string
	wsURL        string
	accountLabel string
	allowFrom    string

	mu       sync.RWMutex
	handler  core.MessageHandler
	socket   *WKSocket
	cancel   context.CancelFunc
	stopping bool

	robotID string
	imToken string

	dedupMu sync.Mutex
	dedup   map[string]time.Time

	// Group buffer: for group/community channels, buffer all messages during a turn
	// and only send the last one when the turn ends (stopTyping is called).
	groupBufMu sync.Mutex
	groupBuf   map[string]*groupBufferEntry
}

type groupBufferEntry struct {
	content     string
	rc          *replyContext
	mentionUIDs []string
}

// New constructs a DMWork platform.
func New(opts map[string]any) (core.Platform, error) {
	botToken, _ := opts["bot_token"].(string)
	if strings.TrimSpace(botToken) == "" {
		return nil, fmt.Errorf("dmwork: bot_token is required")
	}
	apiURL, _ := opts["api_url"].(string)
	if strings.TrimSpace(apiURL) == "" {
		return nil, fmt.Errorf("dmwork: api_url is required")
	}
	wsURL, _ := opts["ws_url"].(string)
	allowFrom, _ := opts["allow_from"].(string)
	accountLabel, _ := opts["account_id"].(string)
	if accountLabel == "" {
		accountLabel = "default"
	}

	core.CheckAllowFrom("dmwork", allowFrom)

	return &Platform{
		botToken:     strings.TrimSpace(botToken),
		apiURL:       strings.TrimSpace(apiURL),
		wsURL:        strings.TrimSpace(wsURL),
		accountLabel: accountLabel,
		allowFrom:    strings.TrimSpace(allowFrom),
		dedup:        make(map[string]time.Time),
		groupBuf:     make(map[string]*groupBufferEntry),
	}, nil
}

func (p *Platform) Name() string { return "dmwork" }

// Start registers the bot and connects to WuKongIM WebSocket.
func (p *Platform) Start(handler core.MessageHandler) error {
	p.mu.Lock()
	p.handler = handler
	p.stopping = false
	p.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	p.cancel = cancel

	creds, err := RegisterBot(ctx, p.apiURL, p.botToken, false)
	if err != nil {
		cancel()
		return fmt.Errorf("dmwork: register bot: %w", err)
	}
	p.robotID = creds.RobotID
	p.imToken = creds.IMToken

	slog.Info("dmwork: bot registered", "robot_id", p.robotID, "account", p.accountLabel)

	wsURL := p.wsURL
	if wsURL == "" && creds.WsURL != "" {
		wsURL = creds.WsURL
	}
	if wsURL == "" {
		u, err := url.Parse(p.apiURL)
		if err == nil {
			scheme := "ws"
			if u.Scheme == "https" {
				scheme = "wss"
			}
			wsURL = fmt.Sprintf("%s://%s/ws", scheme, u.Host)
		}
	}

	slog.Info("dmwork: connecting WS", "url", wsURL)

	p.socket = NewWKSocket(wsURL, p.robotID, p.imToken, p)
	p.socket.Connect()

	go p.restHeartbeat(ctx)

	return nil
}

func (p *Platform) Stop() error {
	p.mu.Lock()
	p.stopping = true
	p.mu.Unlock()

	p.flushAllGroupBuffers()

	if p.cancel != nil {
		p.cancel()
	}
	if p.socket != nil {
		p.socket.Disconnect()
	}
	return nil
}

func (p *Platform) Reply(ctx context.Context, replyCtx any, content string) error {
	return p.send(ctx, replyCtx, content)
}

func (p *Platform) Send(ctx context.Context, replyCtx any, content string) error {
	return p.send(ctx, replyCtx, content)
}

func (p *Platform) send(ctx context.Context, replyCtx any, content string) error {
	rc, ok := replyCtx.(*replyContext)
	if !ok || rc == nil {
		return fmt.Errorf("dmwork: invalid reply context")
	}
	if strings.TrimSpace(content) == "" {
		return nil
	}

	isGroup := rc.channelType == ChannelTypeGroup || rc.channelType == ChannelTypeCommunityTopic

	if isGroup {
		return p.bufferGroupMessage(rc, content)
	}

	// DM channels: send immediately
	return p.sendDirect(ctx, rc, content)
}

// bufferGroupMessage buffers a message for a group channel.
// Only the last buffered message is sent when the turn ends (flushGroupBuffer).
// This ensures group chats only see the final answer, never intermediate tool/thinking output.
func (p *Platform) bufferGroupMessage(rc *replyContext, content string) error {
	content = stripFooter(content)
	if strings.TrimSpace(content) == "" {
		return nil
	}

	if rc.uidNameMap == nil {
		p.ensureGroupMembers(rc)
	}
	mentions, cleaned := p.extractMentions(content, rc.uidNameMap)

	p.groupBufMu.Lock()
	p.groupBuf[rc.channelID] = &groupBufferEntry{content: cleaned, rc: rc, mentionUIDs: mentions}
	p.groupBufMu.Unlock()
	return nil
}

// flushGroupBuffer sends the last buffered message for a channel.
// Called by StartTyping's stop() function at turn end.
func (p *Platform) flushGroupBuffer(channelID string) {
	p.groupBufMu.Lock()
	entry, ok := p.groupBuf[channelID]
	if !ok {
		p.groupBufMu.Unlock()
		return
	}
	delete(p.groupBuf, channelID)
	p.groupBufMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	mentions := entry.mentionUIDs
	if len(mentions) > 0 {
		slog.Info("dmwork: flushing group buffer with mentions", "channel", channelID, "uids", mentions)
	}
	chunks := splitContent(entry.content, maxChunkSize)
	for i, chunk := range chunks {
		if i > 0 {
			select {
			case <-ctx.Done():
				return
			case <-time.After(100 * time.Millisecond):
			}
		}
		if err := SendTextMessage(ctx, SendTextParams{
			APIURL:      p.apiURL,
			BotToken:    p.botToken,
			ChannelID:   entry.rc.channelID,
			ChannelType: entry.rc.channelType,
			Content:     chunk,
			MentionUIDs: mentions,
		}); err != nil {
			slog.Error("dmwork: flush group buffer failed", "channel", channelID, "error", err)
			return
		}
	}
}

// flushAllGroupBuffers sends all buffered group messages (shutdown).
func (p *Platform) flushAllGroupBuffers() {
	p.groupBufMu.Lock()
	entries := make(map[string]*groupBufferEntry)
	for k, v := range p.groupBuf {
		entries[k] = v
	}
	p.groupBuf = make(map[string]*groupBufferEntry)
	p.groupBufMu.Unlock()

	for channelID, entry := range entries {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		chunks := splitContent(entry.content, maxChunkSize)
		for i, chunk := range chunks {
			if i > 0 {
				select {
				case <-ctx.Done():
					cancel()
					return
				case <-time.After(100 * time.Millisecond):
				}
			}
			if err := SendTextMessage(ctx, SendTextParams{
				APIURL:      p.apiURL,
				BotToken:    p.botToken,
				ChannelID:   entry.rc.channelID,
				ChannelType: entry.rc.channelType,
				Content:     chunk,
				MentionUIDs: entry.mentionUIDs,
			}); err != nil {
				slog.Error("dmwork: flush group buffer failed (shutdown)", "channel", channelID, "error", err)
			}
		}
		cancel()
	}
}

// stripFooter removes the cc-connect metadata footer line from message content.
// Footer format: "model · effort · 剩余 X% · /path/to/workdir"
// The footer is always the last line and starts with a model name or context indicator.
func stripFooter(content string) string {
	lines := strings.Split(content, "\n")
	if len(lines) <= 1 {
		return content
	}
	lastLine := strings.TrimSpace(lines[len(lines)-1])
	// Detect footer: contains " · " separator AND (contains "剩余" or "%" or starts with "[ctx:")
	if strings.Contains(lastLine, " · ") && (strings.Contains(lastLine, "剩余") || strings.Contains(lastLine, "%") || strings.HasPrefix(lastLine, "[ctx:")) {
		lines = lines[:len(lines)-1]
		return strings.Join(lines, "\n")
	}
	return content
}

// sendDirect sends text immediately (DM channels).
func (p *Platform) sendDirect(ctx context.Context, rc *replyContext, content string) error {
	chunks := splitContent(content, maxChunkSize)
	for i, chunk := range chunks {
		if i > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(100 * time.Millisecond):
			}
		}
		if err := SendTextMessage(ctx, SendTextParams{
			APIURL:      p.apiURL,
			BotToken:    p.botToken,
			ChannelID:   rc.channelID,
			ChannelType: rc.channelType,
			Content:     chunk,
		}); err != nil {
			return fmt.Errorf("dmwork: send chunk %d/%d: %w", i+1, len(chunks), err)
		}
	}
	return nil
}

// ensureGroupMembers fetches group members and populates uidNameMap if nil.
func (p *Platform) ensureGroupMembers(rc *replyContext) {
	if rc.uidNameMap != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	members, err := GetGroupMembers(ctx, p.apiURL, p.botToken, rc.channelID)
	if err != nil {
		slog.Warn("dmwork: ensureGroupMembers failed", "channel", rc.channelID, "error", err)
		return
	}
	rc.uidNameMap = make(map[string]string)
	for _, m := range members {
		rc.uidNameMap[m.UID] = m.Name
	}
	slog.Debug("dmwork: lazy-loaded uidNameMap", "channel", rc.channelID, "count", len(rc.uidNameMap))
}

// SendImage implements core.ImageSender — always sent immediately, even for groups.
func (p *Platform) SendImage(ctx context.Context, replyCtx any, img core.ImageAttachment) error {
	rc, ok := replyCtx.(*replyContext)
	if !ok || rc == nil {
		return fmt.Errorf("dmwork: invalid reply context")
	}
	if len(img.Data) == 0 {
		return fmt.Errorf("dmwork: empty image")
	}
	filename := img.FileName
	if filename == "" {
		filename = "image.png"
	}
	return UploadAndSendMedia(ctx, p.apiURL, p.botToken, rc.channelID, rc.channelType, img.Data, filename)
}

// SendFile implements core.FileSender — always sent immediately, even for groups.
func (p *Platform) SendFile(ctx context.Context, replyCtx any, file core.FileAttachment) error {
	rc, ok := replyCtx.(*replyContext)
	if !ok || rc == nil {
		return fmt.Errorf("dmwork: invalid reply context")
	}
	if len(file.Data) == 0 {
		return fmt.Errorf("dmwork: empty file")
	}
	filename := file.FileName
	if filename == "" {
		filename = "file.bin"
	}
	return UploadAndSendMedia(ctx, p.apiURL, p.botToken, rc.channelID, rc.channelType, file.Data, filename)
}

// ReconstructReplyCtx implements core.ReplyContextReconstructor.
func (p *Platform) ReconstructReplyCtx(sessionKey string) (any, error) {
	if strings.HasPrefix(sessionKey, sessionKeyPrefixDM) {
		peerUID := strings.TrimPrefix(sessionKey, sessionKeyPrefixDM)
		return &replyContext{
			channelID:   peerUID,
			channelType: ChannelTypeDM,
			senderUID:   peerUID,
		}, nil
	}
	if strings.HasPrefix(sessionKey, sessionKeyPrefixGroup) {
		groupID := strings.TrimPrefix(sessionKey, sessionKeyPrefixGroup)
		return &replyContext{
			channelID:   groupID,
			channelType: ChannelTypeGroup,
		}, nil
	}
	return nil, fmt.Errorf("dmwork: not a dmwork session key")
}

// FormattingInstructions implements core.FormattingInstructionProvider.
// These instructions are auto-injected into the agent system prompt by the engine.
// No AGENTS.md or external configuration is needed — the platform handles everything natively.
func (p *Platform) FormattingInstructions() string {
	return `## DMWork 消息投递规则

1. 你的文字回复会自动投递到聊天窗口。不要使用 openclaw message send、cc-connect send --message、curl 或任何外部工具发送文字消息。直接回复即可。

2. 群聊中 @提及 其他成员：在回复文字中写 @DisplayName（如 @小丘Codex），系统会自动解析为平台真实 @提及，对方会收到通知。写对方的显示名称即可，不需要 UID。

3. 需要其他 Bot 协作时，在回复中 @对方名称。不要用 shell 命令或外部工具联系对方。

4. 不要使用网络工具发消息。你的网络可能受限。文字回复通过 cc-connect 消息桥自动传递。

5. 发送图片和文件用 cc-connect send --image <path> 或 cc-connect send --file <path>，这是唯一需要主动调用的发送命令。`
}

// restHeartbeat sends periodic heartbeat via REST API as backup.
func (p *Platform) restHeartbeat(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := SendHeartbeat(ctx, p.apiURL, p.botToken); err != nil {
				slog.Debug("dmwork: REST heartbeat failed", "error", err)
			}
		}
	}
}

// SendHeartbeat sends a heartbeat via REST API.
func SendHeartbeat(ctx context.Context, apiURL, botToken string) error {
	_, err := postJSON(ctx, apiURL, botToken, "/v1/bot/heartbeat", map[string]any{})
	return err
}

// splitContent splits content into chunks of maxRunes.
func splitContent(s string, maxRunes int) []string {
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return []string{s}
	}
	var chunks []string
	for len(runes) > 0 {
		n := maxRunes
		if len(runes) < n {
			n = len(runes)
		}
		chunks = append(chunks, string(runes[:n]))
		runes = runes[n:]
	}
	return chunks
}

// StartTyping implements core.TypingIndicator.
// For groups: marks turn start, sends typing indicator.
// Returns a stop() function that flushes the group buffer when the turn ends.
func (p *Platform) StartTyping(ctx context.Context, replyCtx any) (stop func()) {
	rc, ok := replyCtx.(*replyContext)
	if !ok || rc == nil {
		return func() {}
	}
	_ = SendTyping(ctx, p.apiURL, p.botToken, rc.channelID, rc.channelType)

	isGroup := rc.channelType == ChannelTypeGroup || rc.channelType == ChannelTypeCommunityTopic
	if !isGroup {
		return func() {}
	}

	channelID := rc.channelID
	return func() {
		p.flushGroupBuffer(channelID)
	}
}

// extractMentions parses @name patterns from content and resolves them to UIDs.
// Returns the list of mentioned UIDs and the content with @name patterns removed
// (the platform renders mentions natively, so we avoid duplicate display).
func (p *Platform) extractMentions(content string, uidNameMap map[string]string) (mentions []string, cleaned string) {
	if uidNameMap == nil {
		return nil, content
	}

	// Build name -> uid reverse map (lowercase for case-insensitive matching)
	nameToUID := make(map[string]string)
	for uid, name := range uidNameMap {
		nameToUID[strings.ToLower(name)] = uid
	}

	seen := make(map[string]bool)
	var result strings.Builder
	runes := []rune(content)
	for i := 0; i < len(runes); i++ {
		if runes[i] == '@' && (i == 0 || runes[i-1] == ' ' || runes[i-1] == '\n') {
			// Find end of name: stop at whitespace or common punctuation
			j := i + 1
			for j < len(runes) && !isNameDelimiter(runes[j]) {
				j++
			}
			name := string(runes[i+1 : j])
			if uid, ok := nameToUID[strings.ToLower(name)]; ok {
				if !seen[uid] {
					mentions = append(mentions, uid)
					seen[uid] = true
				}
				// Skip the @name in output (platform renders it natively)
				i = j
				continue
			}
		}
		result.WriteRune(runes[i])
	}

	return mentions, strings.TrimSpace(result.String())
}

// isNameDelimiter returns true if the rune should terminate an @mention name.
func isNameDelimiter(r rune) bool {
	switch r {
	case ' ', '\t', '\n', '\r', ',', '.', '。', '，', '！', '？', '；', '：', '、', '!', '?', ';', ':':
		return true
	}
	return false
}

// Interface compliance checks.
var (
	_ core.Platform                      = (*Platform)(nil)
	_ core.ImageSender                   = (*Platform)(nil)
	_ core.FileSender                    = (*Platform)(nil)
	_ core.ReplyContextReconstructor     = (*Platform)(nil)
	_ core.FormattingInstructionProvider = (*Platform)(nil)
	_ core.TypingIndicator               = (*Platform)(nil)
)
