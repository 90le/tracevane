package dmwork

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultAPITimeout = 30 * time.Second

func postJSON(ctx context.Context, apiURL, botToken, path string, payload any) (json.RawMessage, error) {
	reqURL := strings.TrimRight(apiURL, "/") + path
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("dmwork: marshal payload: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, defaultAPITimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("dmwork: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+botToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("dmwork: API %s: %w", path, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("dmwork: read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("dmwork: API %s failed (%d): %s", path, resp.StatusCode, string(respBody))
	}

	// DMWork API returns message_id as a numeric value (e.g. "message_id":123) but our
	// structs expect a string. This rewrite converts numeric message_id to string form.
	// It is intentionally simple: only the first numeric value after "message_id": is affected.
	safe := strings.ReplaceAll(string(respBody), `"message_id":`, `"message_id":"`)
	return json.RawMessage(safe), nil
}

func getJSON(ctx context.Context, apiURL, botToken, path string) (json.RawMessage, error) {
	reqURL := strings.TrimRight(apiURL, "/") + path

	ctx, cancel := context.WithTimeout(ctx, defaultAPITimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("dmwork: create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+botToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("dmwork: API %s: %w", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("dmwork: read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("dmwork: API %s failed (%d): %s", path, resp.StatusCode, string(body))
	}
	return json.RawMessage(body), nil
}

func RegisterBot(ctx context.Context, apiURL, botToken string, forceRefresh bool) (*BotCredentials, error) {
	path := "/v1/bot/register"
	if forceRefresh {
		path += "?force_refresh=true"
	}
	raw, err := postJSON(ctx, apiURL, botToken, path, map[string]any{})
	if err != nil {
		return nil, err
	}
	var creds BotCredentials
	if err := json.Unmarshal(raw, &creds); err != nil {
		return nil, fmt.Errorf("dmwork: parse register response: %w", err)
	}
	return &creds, nil
}

func SendTextMessage(ctx context.Context, p SendTextParams) error {
	payload := map[string]any{
		"type":    MessageTypeText,
		"content": p.Content,
	}
	if len(p.MentionUIDs) > 0 {
		payload["mention"] = map[string]any{"uids": p.MentionUIDs}
	}
	_, err := postJSON(ctx, p.APIURL, p.BotToken, "/v1/bot/sendMessage", map[string]any{
		"channel_id":   p.ChannelID,
		"channel_type": p.ChannelType,
		"payload":      payload,
	})
	return err
}

func SendMediaMessage(ctx context.Context, p SendMediaParams) error {
	payload := map[string]any{
		"type": p.Type,
		"url":  p.URL,
	}
	if p.Type == MessageTypeImage {
		if p.Width > 0 {
			payload["width"] = p.Width
		}
		if p.Height > 0 {
			payload["height"] = p.Height
		}
	}
	if p.Name != "" {
		payload["name"] = p.Name
	}
	if p.Size > 0 {
		payload["size"] = p.Size
	}
	_, err := postJSON(ctx, p.APIURL, p.BotToken, "/v1/bot/sendMessage", map[string]any{
		"channel_id":   p.ChannelID,
		"channel_type": p.ChannelType,
		"payload":      payload,
	})
	return err
}

func SendTyping(ctx context.Context, apiURL, botToken, channelID string, channelType ChannelType) error {
	_, err := postJSON(ctx, apiURL, botToken, "/v1/bot/typing", map[string]any{
		"channel_id":   channelID,
		"channel_type": channelType,
	})
	return err
}

func SendReadReceipt(ctx context.Context, apiURL, botToken, channelID string, channelType ChannelType) error {
	_, err := postJSON(ctx, apiURL, botToken, "/v1/bot/readReceipt", map[string]any{
		"channel_id":   channelID,
		"channel_type": channelType,
	})
	return err
}

func GetUploadCredentials(ctx context.Context, apiURL, botToken, filename string) (*UploadCredentials, error) {
	path := fmt.Sprintf("/v1/bot/upload/credentials?filename=%s", url.QueryEscape(filename))
	raw, err := getJSON(ctx, apiURL, botToken, path)
	if err != nil {
		return nil, err
	}
	var creds UploadCredentials
	if err := json.Unmarshal(raw, &creds); err != nil {
		return nil, fmt.Errorf("dmwork: parse upload credentials: %w", err)
	}
	if creds.Bucket == "" || creds.Region == "" || creds.Key == "" {
		return nil, fmt.Errorf("dmwork: incomplete upload credentials response")
	}
	if creds.Credentials.TmpSecretID == "" || creds.Credentials.TmpSecretKey == "" {
		return nil, fmt.Errorf("dmwork: incomplete STS credentials")
	}
	return &creds, nil
}

func InferContentType(filename string) string {
	ext := strings.ToLower(filename)
	if idx := strings.LastIndex(ext, "."); idx >= 0 {
		ext = ext[idx:]
	}
	mimes := map[string]string{
		".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
		".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
		".bmp": "image/bmp",
		".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
		".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
		".pdf": "application/pdf", ".zip": "application/zip",
		".doc": "application/msword",
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".xls": "application/vnd.ms-excel",
		".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8",
		".csv": "text/csv; charset=utf-8", ".html": "text/html; charset=utf-8",
		".json": "application/json", ".yaml": "text/yaml", ".yml": "text/yaml",
		".xml": "text/xml", ".css": "text/css",
	}
	if m, ok := mimes[ext]; ok {
		return m
	}
	return "application/octet-stream"
}

func logAPI() *slog.Logger {
	return slog.Default().With("platform", "dmwork")
}

// GetChannelMessages fetches recent message history from a channel.
// Uses its own HTTP call to avoid postJSON's message_id rewriting.
func GetChannelMessages(ctx context.Context, apiURL, botToken, channelID string, channelType ChannelType, limit int) ([]HistoryMessage, error) {
	reqURL := strings.TrimRight(apiURL, "/") + "/v1/bot/messages/sync"
	if limit <= 0 {
		limit = 20
	}

	body, _ := json.Marshal(map[string]any{
		"channel_id":         channelID,
		"channel_type":       channelType,
		"limit":              limit,
		"start_message_seq":  0,
		"end_message_seq":    0,
		"pull_mode":          1,
	})

	ctx2, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx2, http.MethodPost, reqURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+botToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("dmwork: messages/sync: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("dmwork: messages/sync read: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("dmwork: messages/sync failed (%d): %s", resp.StatusCode, string(respBody))
	}

	var data struct {
		Messages []struct {
			FromUID   string `json:"from_uid"`
			Payload   string `json:"payload"`
			Timestamp int64  `json:"timestamp"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(respBody, &data); err != nil {
		return nil, fmt.Errorf("dmwork: messages/sync parse: %w", err)
	}

	var result []HistoryMessage
	for _, m := range data.Messages {
		hm := HistoryMessage{
			FromUID:   m.FromUID,
			Timestamp: m.Timestamp,
		}
		if m.Payload != "" {
			decoded, err := base64.StdEncoding.DecodeString(m.Payload)
			if err == nil {
				var p struct {
					Type    MessageType `json:"type"`
					Content string      `json:"content"`
					URL     string      `json:"url"`
					Name    string      `json:"name"`
				}
				if json.Unmarshal(decoded, &p) == nil {
					hm.Type = p.Type
					hm.Content = p.Content
					hm.URL = p.URL
					hm.Name = p.Name
				}
			}
		}
		result = append(result, hm)
	}
	return result, nil
}

// GetGroupMembers fetches the member list of a group.
func GetGroupMembers(ctx context.Context, apiURL, botToken, groupID string) ([]GroupMember, error) {
	path := fmt.Sprintf("/v1/bot/groups/%s/members", url.PathEscape(groupID))
	raw, err := getJSON(ctx, apiURL, botToken, path)
	if err != nil {
		return nil, err
	}
	var members []GroupMember
	if err := json.Unmarshal(raw, &members); err != nil {
		return nil, fmt.Errorf("dmwork: parse group members: %w", err)
	}
	return members, nil
}

// GetUserInfo fetches a user's display name.
func GetUserInfo(ctx context.Context, apiURL, botToken, uid string) (*UserInfo, error) {
	path := fmt.Sprintf("/v1/bot/user/info?uid=%s", url.QueryEscape(uid))
	raw, err := getJSON(ctx, apiURL, botToken, path)
	if err != nil {
		return nil, err
	}
	var info UserInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return nil, fmt.Errorf("dmwork: parse user info: %w", err)
	}
	return &info, nil
}
