package app

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"sync"

	"clara-mundi/internal/clientnet"
	"clara-mundi/internal/host"
	"clara-mundi/internal/protocol"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const defaultServerURL = "http://127.0.0.1:8080"

// App is the Wails-bound desktop client: Go owns WebSocket transport and
// movement prediction; React + Phaser remain a thin presentation layer.
// Optionally embeds an in-process game server (standalone / testing).
type App struct {
	ctx context.Context

	mu           sync.Mutex
	serverBase   string
	ws           clientnet.Conn
	pred         clientnet.Predictor
	embedded     *host.Runtime
	standalone   bool
	embedErr     string
}

func New() *App {
	return &App{
		serverBase: defaultServerURL,
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.ws.OnEnvelope = a.handleEnvelope
	a.ws.OnConnected = func() {
		runtime.EventsEmit(a.ctx, "game:connected", nil)
	}
	a.ws.OnDisconnected = func(intentional bool) {
		runtime.EventsEmit(a.ctx, "game:disconnected", map[string]any{"intentional": intentional})
	}
	a.ws.OnError = func(msg string) {
		runtime.EventsEmit(a.ctx, "game:error", map[string]string{"message": msg})
	}

	if err := a.maybeStartEmbedded(); err != nil {
		log.Printf("embedded server failed: %v", err)
		a.mu.Lock()
		a.embedErr = err.Error()
		a.serverBase = "" // do not silently fall back to :8080
		a.mu.Unlock()
		runtime.EventsEmit(a.ctx, "game:error", map[string]string{
			"message": "Embedded game server failed to start: " + err.Error(),
		})
	}
}

func (a *App) Shutdown(_ context.Context) {
	a.ws.Disconnect()
	a.mu.Lock()
	rt := a.embedded
	a.embedded = nil
	a.mu.Unlock()
	if rt != nil {
		_ = rt.Close()
	}
}

func (a *App) maybeStartEmbedded() error {
	if !host.WantStandalone() {
		return nil
	}
	if err := host.EnsureWorkingDir(); err != nil {
		return err
	}
	opts := host.StandaloneOptions()
	rt, err := host.Start(opts)
	if err != nil {
		return err
	}
	a.mu.Lock()
	a.embedded = rt
	a.standalone = true
	a.embedErr = ""
	a.serverBase = rt.BaseURL
	a.mu.Unlock()
	log.Printf("standalone: in-process game server at %s (accounts/profiles are external JSON under the data dir)", rt.BaseURL)
	return nil
}

func (a *App) serverURL() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.embedErr != "" {
		return "", errString("embedded game server failed to start: " + a.embedErr)
	}
	if a.serverBase == "" {
		if host.WantStandalone() {
			return "", errString("embedded game server is not running")
		}
		return defaultServerURL, nil
	}
	return a.serverBase, nil
}

// GetServerURL returns the REST/WebSocket base URL for the game cluster.
func (a *App) GetServerURL() string {
	url, err := a.serverURL()
	if err != nil {
		return ""
	}
	return url
}

// SetServerURL sets the REST/WebSocket base URL (ignored when standalone).
func (a *App) SetServerURL(url string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.standalone {
		return
	}
	a.serverBase = url
}

// IsStandalone reports whether this build/session embeds an in-process server.
func (a *App) IsStandalone() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.standalone
}

func (a *App) handleEnvelope(data []byte) {
	var env protocol.Envelope
	if err := json.Unmarshal(data, &env); err != nil {
		return
	}
	a.pred.UpdateFromEnvelope(string(env.Type), env.Payload)
	runtime.EventsEmit(a.ctx, "game:envelope", string(data))
}

// Connect opens the game WebSocket using the player's JWT.
func (a *App) Connect(token string) error {
	if token == "" {
		return errString("missing auth token")
	}
	base, err := a.serverURL()
	if err != nil {
		return err
	}
	wsURL, err := clientnet.WSURL(base, token)
	if err != nil {
		return err
	}
	return a.ws.Connect(wsURL)
}

// Disconnect closes the game WebSocket.
func (a *App) Disconnect() {
	a.ws.Disconnect()
}

// IsConnected reports whether the WebSocket is open.
func (a *App) IsConnected() bool {
	return a.ws.Connected()
}

// SendEnvelope sends a typed protocol frame to the server.
func (a *App) SendEnvelope(typeName string, payloadJSON string) error {
	var payload any
	if payloadJSON != "" {
		if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
			return err
		}
	}
	return a.ws.Send(typeName, payload)
}

// StepMove applies shared Go collision (internal/game) for client prediction.
func (a *App) StepMove(fromX, fromY, toX, toY float64) map[string]float64 {
	x, y := a.pred.StepMove(fromX, fromY, toX, toY)
	return map[string]float64{"x": x, "y": y}
}

// GetPredictedPosition returns the last Go-predicted player position.
func (a *App) GetPredictedPosition() map[string]float64 {
	x, y := a.pred.Position()
	return map[string]float64{"x": x, "y": y}
}

type errString string

func (e errString) Error() string { return string(e) }

// DefaultServerFromEnv allows FANTASY_SERVER_URL override during client-only mode.
func DefaultServerFromEnv() string {
	if v := os.Getenv("FANTASY_SERVER_URL"); v != "" {
		return v
	}
	return defaultServerURL
}
