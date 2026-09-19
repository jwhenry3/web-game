package app

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func resolveAPIURL(base, path string) string {
	base = strings.TrimRight(base, "/")
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		if u, err := url.Parse(path); err == nil {
			return base + u.RequestURI()
		}
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return base + path
}

func (a *App) apiRequest(method, path, body, token string) (string, int, error) {
	base, err := a.serverURL()
	if err != nil {
		return "", 0, err
	}
	var bodyReader io.Reader
	if body != "" || method == http.MethodPost || method == http.MethodPut {
		bodyReader = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, resolveAPIURL(base, path), bodyReader)
	if err != nil {
		return "", 0, err
	}
	if body != "" || method == http.MethodPost || method == http.MethodPut {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		return "", res.StatusCode, err
	}
	// Binary payloads (e.g. /api/mapimg PNGs) can't cross the JS bridge as a
	// raw string — UTF-8 coercion corrupts them. Wrap as a data URI;
	// wailsPlatformFetch decodes it back into bytes.
	if isBinaryContentType(res.Header.Get("Content-Type")) {
		return "data:" + res.Header.Get("Content-Type") + ";base64," +
			base64.StdEncoding.EncodeToString(data), res.StatusCode, nil
	}
	return string(data), res.StatusCode, nil
}

// isBinaryContentType reports whether a response Content-Type carries bytes
// that would not survive a UTF-8 string round-trip through the Wails bridge.
func isBinaryContentType(ct string) bool {
	ct = strings.ToLower(strings.TrimSpace(strings.Split(ct, ";")[0]))
	if ct == "" {
		return false
	}
	return !(strings.HasPrefix(ct, "text/") ||
		ct == "application/json" || strings.HasSuffix(ct, "+json"))
}

// APIGet proxies a GET request to the game server REST API.
func (a *App) APIGet(path string, token string) (string, error) {
	body, status, err := a.apiRequest(http.MethodGet, path, "", token)
	if err != nil {
		return "", err
	}
	if status >= 400 {
		return "", fmt.Errorf("%s", trimAPIError(body, status))
	}
	return body, nil
}

// APIPost proxies a POST request to the game server REST API.
func (a *App) APIPost(path string, body string, token string) (string, error) {
	resp, status, err := a.apiRequest(http.MethodPost, path, body, token)
	if err != nil {
		return "", err
	}
	if status >= 400 {
		return "", fmt.Errorf("%s", trimAPIError(resp, status))
	}
	return resp, nil
}

// APIPut proxies a PUT request to the game server REST API.
func (a *App) APIPut(path string, body string, token string) (string, error) {
	resp, status, err := a.apiRequest(http.MethodPut, path, body, token)
	if err != nil {
		return "", err
	}
	if status >= 400 {
		return "", fmt.Errorf("%s", trimAPIError(resp, status))
	}
	return resp, nil
}

// APIDelete proxies a DELETE request to the game server REST API.
func (a *App) APIDelete(path string, token string) (string, error) {
	resp, status, err := a.apiRequest(http.MethodDelete, path, "", token)
	if err != nil {
		return "", err
	}
	if status >= 400 {
		return "", fmt.Errorf("%s", trimAPIError(resp, status))
	}
	return resp, nil
}

func trimAPIError(body string, status int) string {
	body = strings.TrimSpace(body)
	if body == "" {
		return fmt.Sprintf("request failed (%d)", status)
	}
	return body
}
