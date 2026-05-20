package dmwork

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/chenhg5/cc-connect/core"
)

const historyLimit = 30

// OnMessage handles an incoming WuKongIM message and dispatches it to the core engine.
func (p *Platform) OnMessage(msg *WSMessage) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("dmwork: OnMessage panic recovered", "error", r)
		}
	}()

	// Dedup by message ID
	p.dedupMu.Lock()
	if _, exists := p.dedup[msg.MessageID]; exists {
		p.dedupMu.Unlock()
		return
	}
	p.dedup[msg.MessageID] = time.Now()
	cutoff := time.Now().Add(-5 * time.Minute)
	for k, v := range p.dedup {
		if v.Before(cutoff) {
			delete(p.dedup, k)
		}
	}
	p.dedupMu.Unlock()

	p.mu.RLock()
	handler := p.handler
	p.mu.RUnlock()

	if handler == nil {
		return
	}

	// Skip messages from self
	if msg.FromUID == p.robotID {
		return
	}

	// Skip system messages
	if msg.Payload.Type == 99 || msg.FromUID == "" || msg.FromUID == "system" {
		slog.Debug("dmwork: skipping system message", "type", msg.Payload.Type,
			"channel_id", msg.ChannelID, "from_uid", msg.FromUID)
		return
	}

	if msg.ChannelID == "systemcmdonline" {
		return
	}

	isGroup := msg.ChannelType == ChannelTypeGroup || msg.ChannelType == ChannelTypeCommunityTopic

	// For group/community channels: only respond when bot is mentioned or replied to
	if isGroup && !p.isDirectedAtBot(msg) {
		slog.Debug("dmwork: ignoring group message not directed at bot",
			"channel", msg.ChannelID, "from", msg.FromUID, "content", truncateStr(msg.Payload.Content, 50))
		return
	}

	// Build session key
	var sessionKey string
	switch msg.ChannelType {
	case ChannelTypeDM:
		sessionKey = sessionKeyPrefixDM + msg.FromUID
	case ChannelTypeGroup, ChannelTypeCommunityTopic:
		sessionKey = sessionKeyPrefixGroup + msg.ChannelID
	default:
		sessionKey = sessionKeyPrefixDM + msg.FromUID
	}

	// Build reply context
	rc := &replyContext{
		channelID:   msg.ChannelID,
		channelType: msg.ChannelType,
		senderUID:   msg.FromUID,
	}
	if msg.ChannelType == ChannelTypeDM {
		rc.channelID = msg.FromUID
	}

	// For group channels: pre-fetch member mapping for @mention resolution
	if isGroup {
		p.populateGroupMembers(rc, msg.ChannelID)
	}

	// Parse payload content
	content := ""
	var images []core.ImageAttachment
	var files []core.FileAttachment

	switch msg.Payload.Type {
	case MessageTypeText:
		content = msg.Payload.Content
	case MessageTypeImage:
		content = "[图片]"
		if msg.Payload.URL != "" {
			imgData, err := downloadMedia(msg.Payload.URL)
			if err != nil {
				slog.Warn("dmwork: download image failed", "url", msg.Payload.URL, "error", err)
			} else if imgData != nil {
				images = append(images, core.ImageAttachment{
					MimeType: "image/png",
					Data:     imgData,
					FileName: msg.Payload.Name,
				})
			}
		}
	case MessageTypeFile:
		content = fmt.Sprintf("[文件: %s]", msg.Payload.Name)
		if msg.Payload.URL != "" {
			fileData, err := downloadMedia(msg.Payload.URL)
			if err != nil {
				slog.Warn("dmwork: download file failed", "url", msg.Payload.URL, "error", err)
			} else if fileData != nil {
				mime := InferContentType(msg.Payload.Name)
				files = append(files, core.FileAttachment{
					MimeType: mime,
					Data:     fileData,
					FileName: msg.Payload.Name,
				})
			}
		}
	case MessageTypeVoice:
		content = "[语音消息]"
	case MessageTypeVideo:
		content = "[视频]"
	case MessageTypeLocation:
		content = msg.Payload.Content
	default:
		content = msg.Payload.Content
		if content == "" {
			content = fmt.Sprintf("[消息类型: %d]", msg.Payload.Type)
		}
	}

	if content == "" && len(images) == 0 && len(files) == 0 {
		return
	}

	// Strip @bot mention from content for cleaner processing
	if isGroup {
		content = p.stripMentionFromContent(content, msg)
	}

	// For group messages: fetch recent history and inject as context
	var extraContent string
	if isGroup {
		extraContent = p.buildGroupHistoryContext(msg, rc.uidNameMap)
	}

	slog.Info("dmwork: dispatching message to handler", "from", msg.FromUID, "channel", msg.ChannelID,
		"type", msg.ChannelType, "content_len", len(content), "history_len", len(extraContent))

	coreMsg := &core.Message{
		SessionKey:  sessionKey,
		Platform:    "dmwork",
		MessageID:   msg.MessageID,
		UserID:      msg.FromUID,
		Content:     content,
		Images:      images,
		Files:       files,
		ExtraContent: extraContent,
		ReplyCtx:    rc,
	}

	handler(p, coreMsg)
}

// isDirectedAtBot checks if a group message is directed at the bot.
func (p *Platform) isDirectedAtBot(msg *WSMessage) bool {
	if msg.Payload.Mention != nil {
		for _, uid := range msg.Payload.Mention.UIDs {
			if uid == p.robotID {
				return true
			}
		}
		if msg.Payload.Mention.All > 0 {
			return true
		}
	}
	if msg.Payload.Reply != nil && msg.Payload.Reply.MessageID != "" {
		return true
	}
	if strings.HasPrefix(strings.TrimSpace(msg.Payload.Content), "/") {
		return true
	}
	return false
}





// stripMentionFromContent removes the @bot mention text from message content.
func (p *Platform) stripMentionFromContent(content string, msg *WSMessage) string {
	if content == "" {
		return content
	}
	content = strings.TrimSpace(content)
	for strings.HasPrefix(content, "@") {
		idx := strings.IndexByte(content, ' ')
		if idx <= 0 {
			break
		}
		content = strings.TrimSpace(content[idx:])
	}
	return content
}

// truncateStr truncates a string for logging.
func truncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

// OnConnected is called when WebSocket connects successfully.
func (p *Platform) OnConnected() {
	slog.Info("dmwork: WebSocket connected", "account", p.accountLabel)
}

// OnDisconnected is called when WebSocket disconnects.
func (p *Platform) OnDisconnected() {
	slog.Warn("dmwork: WebSocket disconnected", "account", p.accountLabel)
}

// OnError is called on WebSocket errors.
func (p *Platform) OnError(err error) {
	slog.Error("dmwork: WebSocket error", "error", err, "account", p.accountLabel)
}

// downloadMedia downloads a file from a URL with a 50MB limit.
func downloadMedia(rawURL string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	return io.ReadAll(io.LimitReader(resp.Body, 50<<20))
}


// populateGroupMembers fetches group members and stores them in the replyContext
// for later @mention resolution during send.
func (p *Platform) populateGroupMembers(rc *replyContext, channelID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	members, err := GetGroupMembers(ctx, p.apiURL, p.botToken, channelID)
	if err != nil {
		slog.Debug("dmwork: failed to fetch group members for mention resolution", "error", err)
		return
	}

	rc.uidNameMap = make(map[string]string)
	for _, m := range members {
		rc.uidNameMap[m.UID] = m.Name
		if m.Robot == 1 {
			rc.botUIDs = append(rc.botUIDs, m.UID)
		}
	}
}

// buildGroupHistoryContext fetches recent messages and formats as context.
// Uses the already-fetched uidNameMap from replyContext to avoid duplicate API calls.
// Includes member list with names so the agent can @mention people.
// Limits output to ~100k chars, truncating oldest messages first.
func (p *Platform) buildGroupHistoryContext(msg *WSMessage, uidName map[string]string) string {
	const maxHistoryChars = 100000

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Build member list from already-fetched uidNameMap
	var memberList []string
	for uid, name := range uidName {
		label := name
		memberList = append(memberList, fmt.Sprintf("- %s (uid: %s)", label, uid))
	}
	slices.Sort(memberList)

	// 2. Fetch recent messages
	messages, err := GetChannelMessages(ctx, p.apiURL, p.botToken, msg.ChannelID, msg.ChannelType, historyLimit)
	if err != nil {
		slog.Debug("dmwork: failed to fetch group history", "error", err)
	}

	// 3. Build member list section
	var sb strings.Builder
	if len(memberList) > 0 {
		sb.WriteString("👥 群成员列表：\n")
		for _, line := range memberList {
			sb.WriteString(line)
			sb.WriteByte('\n')
		}
		sb.WriteByte('\n')
	}

	// 4. Build history section
	if len(messages) > 0 {
		var lines []string
		for _, m := range messages {
			if m.FromUID == p.robotID {
				continue
			}
			body := formatHistoryMsg(m)
			if body == "" {
				continue
			}
			sender := resolveName(m.FromUID, uidName)
			var line string
			if m.Timestamp > 0 {
				line = fmt.Sprintf("[%s] %s: %s", time.Unix(m.Timestamp, 0).Format("15:04"), sender, body)
			} else {
				line = fmt.Sprintf("%s: %s", sender, body)
			}
			lines = append(lines, line)
		}

		if len(lines) > 0 {
			sb.WriteString("📋 群聊最近对话记录：\n")

			// Budget: keep newest messages, drop oldest if over limit
			budget := maxHistoryChars - sb.Len()
			var kept []string
			totalChars := 0
			for i := len(lines) - 1; i >= 0; i-- {
				n := len(lines[i]) + 1
				if totalChars+n > budget {
					break
				}
				kept = append(kept, lines[i])
				totalChars += n
			}
			for l, r := 0, len(kept)-1; l < r; l, r = l+1, r-1 {
				kept[l], kept[r] = kept[r], kept[l]
			}
			for _, line := range kept {
				sb.WriteString(line)
				sb.WriteByte('\n')
			}
		}
	}

	if sb.Len() == 0 {
		return ""
	}
	sb.WriteString("---\n")
	return sb.String()
}

// resolveName returns the display name for a uid, or the uid itself.
func resolveName(uid string, uidName map[string]string) string {
	if name, ok := uidName[uid]; ok && name != "" {
		return name
	}
	return uid
}

// formatHistoryMsg formats a history message for context injection.
func formatHistoryMsg(m HistoryMessage) string {
	switch m.Type {
	case MessageTypeText:
		return m.Content
	case MessageTypeImage:
		return "[图片]"
	case MessageTypeFile:
		name := m.Name
		if name == "" {
			name = "文件"
		}
		return fmt.Sprintf("[文件: %s]", name)
	case MessageTypeVoice:
		return "[语音消息]"
	case MessageTypeVideo:
		return "[视频]"
	default:
		return m.Content
	}
}
