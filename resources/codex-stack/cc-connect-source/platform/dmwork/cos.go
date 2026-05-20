package dmwork

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"

	"github.com/tencentyun/cos-go-sdk-v5"
)

const smallFileThreshold = 300 * 1024 // 300KB — use multipart API below this

// UploadAndSendMedia handles the full flow: upload → send media message.
func UploadAndSendMedia(ctx context.Context, apiURL, botToken, channelID string, channelType ChannelType, fileData []byte, filename string) error {
	contentType := InferContentType(filename)
	isImage := strings.HasPrefix(contentType, "image/")

	var uploadedURL string
	var err error

	if len(fileData) < smallFileThreshold {
		// Small files: use simple multipart upload API
		uploadedURL, err = uploadViaMultipart(ctx, apiURL, botToken, fileData, filename, contentType)
	} else {
		// Large files: use STS credentials + COS SDK direct upload
		uploadedURL, err = uploadViaCOS(ctx, apiURL, botToken, fileData, filename, contentType)
	}

	if err != nil {
		return fmt.Errorf("dmwork: upload file: %w", err)
	}

	slog.Info("dmwork: media uploaded", "filename", filename, "url", uploadedURL, "isImage", isImage, "size", len(fileData))

	msgType := MessageTypeFile
	if isImage {
		msgType = MessageTypeImage
	}

	return SendMediaMessage(ctx, SendMediaParams{
		APIURL:      apiURL,
		BotToken:    botToken,
		ChannelID:   channelID,
		ChannelType: channelType,
		Type:        msgType,
		URL:         uploadedURL,
		Name:        filename,
		Size:        int64(len(fileData)),
	})
}

// uploadViaMultipart uses POST /v1/bot/file/upload for small files.
func uploadViaMultipart(ctx context.Context, apiURL, botToken string, fileData []byte, filename, contentType string) (string, error) {
	endpoint := strings.TrimRight(apiURL, "/") + "/v1/bot/file/upload"

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", err
	}
	part.Write(fileData)
	writer.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+botToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("multipart upload failed (%d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(body, &result); err != nil || result.URL == "" {
		return "", fmt.Errorf("parse upload response: %s", string(body))
	}
	return result.URL, nil
}

// uploadViaCOS uses STS temporary credentials to upload directly to COS.
func uploadViaCOS(ctx context.Context, apiURL, botToken string, fileData []byte, filename, contentType string) (string, error) {
	creds, err := GetUploadCredentials(ctx, apiURL, botToken, filename)
	if err != nil {
		return "", fmt.Errorf("get upload credentials: %w", err)
	}

	// Build COS bucket URL
	bucketURL, err := url.Parse(fmt.Sprintf("https://%s.cos.%s.myqcloud.com", creds.Bucket, creds.Region))
	if err != nil {
		return "", fmt.Errorf("parse bucket URL: %w", err)
	}

	// Create COS client with STS credentials
	client := cos.NewClient(&cos.BaseURL{
		BucketURL: bucketURL,
	}, &http.Client{
		Transport: &cos.AuthorizationTransport{
			SecretID:     creds.Credentials.TmpSecretID,
			SecretKey:    creds.Credentials.TmpSecretKey,
			SessionToken: creds.Credentials.SessionToken,
		},
	})

	// Upload using putObject
	opt := &cos.ObjectPutOptions{
		ObjectPutHeaderOptions: &cos.ObjectPutHeaderOptions{
			ContentType:   contentType,
			ContentLength: int64(len(fileData)),
		},
	}

	_, err = client.Object.Put(ctx, creds.Key, bytes.NewReader(fileData), opt)
	if err != nil {
		return "", fmt.Errorf("COS putObject: %w", err)
	}

	// Build download URL
	if creds.CDNBaseURL != "" {
		base := strings.TrimRight(creds.CDNBaseURL, "/")
		parts := strings.Split(creds.Key, "/")
		for i, p := range parts {
			parts[i] = url.PathEscape(p)
		}
		return base + "/" + strings.Join(parts, "/"), nil
	}

	return fmt.Sprintf("https://%s.cos.%s.myqcloud.com/%s", creds.Bucket, creds.Region, creds.Key), nil
}
