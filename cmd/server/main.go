package main

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"log"
	"net/http"
	"os"
	"strconv"

	"ffv-web-game/internal/auth"
	"ffv-web-game/internal/game"
	"ffv-web-game/internal/plugins/combatatb"
	"ffv-web-game/internal/server"
	"ffv-web-game/internal/servercfg"
	"ffv-web-game/internal/store"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func newClientID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("failed to generate client id: %v", err)
	}
	return "p-" + hex.EncodeToString(b)
}

func main() {
	configFile := flag.String("config", "config/server.json", "server configuration file")
	addr := flag.String("addr", "", "http listen address (overrides config)")
	dataFile := flag.String("data", "", "player profile persistence file (overrides config)")
	accountsFile := flag.String("accounts", "", "account persistence file (overrides config)")
	jwtSecret := flag.String("jwt-secret", "", "JWT signing secret (required in production)")
	staticDir := flag.String("static", "", "frontend build to serve (overrides config)")
	battleSpeed := flag.Float64("battle-speed", 0, "battle tempo multiplier (overrides config)")
	overworldFile := flag.String("overworld", "", "overworld map config (overrides config)")
	flag.Parse()

	cfg, err := servercfg.Load(*configFile)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	overrides := servercfg.Overrides{
		Addr:      *addr,
		Data:      *dataFile,
		Accounts:  *accountsFile,
		Static:    *staticDir,
		Overworld: *overworldFile,
	}
	if *battleSpeed > 0 {
		overrides.BattleSpeed = *battleSpeed
	}
	if v := os.Getenv("BATTLE_SPEED"); v != "" && overrides.BattleSpeed <= 0 {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			overrides.BattleSpeed = f
		}
	}
	if err := cfg.ApplyOverrides(overrides); err != nil {
		log.Fatalf("config overrides: %v", err)
	}

	if err := game.LoadOverworld(cfg.Server.Overworld); err != nil {
		log.Fatalf("overworld: %v", err)
	}
	if cfg.Server.Name != "" {
		log.Printf("server: %s", cfg.Server.Name)
	}
	log.Printf("overworld: %s", game.OverworldPath())

	secret := *jwtSecret
	if secret == "" {
		secret = os.Getenv("JWT_SECRET")
	}
	if secret == "" {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			log.Fatal(err)
		}
		secret = hex.EncodeToString(b)
		log.Printf("warning: using ephemeral JWT secret; set -jwt-secret or JWT_SECRET for production")
	}

	profiles := store.Load(cfg.Server.Data)
	accounts := store.LoadAccounts(cfg.Server.Accounts)
	tokens := auth.NewTokenIssuer(secret)
	hub, err := server.NewHub(profiles, accounts, tokens, cfg.Server.BattleSpeed, cfg.Plugins)
	if err != nil {
		log.Fatalf("hub: %v", err)
	}
	log.Printf("config: %s", *configFile)
	log.Printf("combat plugin: %s", cfg.Plugins.Combat)
	log.Printf("battle speed: %.2fx (tick window %s)", cfg.Server.BattleSpeed, combatatb.BattleTickWindow(cfg.Server.BattleSpeed))
	go hub.Run()

	authHandler := server.NewAuthHandler(accounts, profiles, tokens, hub)

	apiMux := http.NewServeMux()
	server.RegisterAPIRoutes(apiMux, authHandler, cfg.Plugins)

	mux := http.NewServeMux()
	mux.Handle("/api/", http.StripPrefix("/api", apiMux))

	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		if token == "" {
			h := r.Header.Get("Authorization")
			if len(h) > 7 && h[:7] == "Bearer " {
				token = h[7:]
			}
		}
		var accountID, username string
		if token != "" {
			claims, err := tokens.Parse(token)
			if err != nil {
				http.Error(w, "invalid token", http.StatusUnauthorized)
				return
			}
			accountID = claims.AccountID
			username = claims.Username
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("upgrade error: %v", err)
			return
		}
		client := &server.Client{
			ID:        newClientID(),
			Conn:      conn,
			Send:      make(chan []byte, 256),
			Hub:       hub,
			AccountID: accountID,
			Username:  username,
		}
		hub.Register(client)
		go client.WritePump()
		go client.ReadPump()
	})

	if info, err := os.Stat(cfg.Server.Static); err == nil && info.IsDir() {
		mux.Handle("/", http.FileServer(http.Dir(cfg.Server.Static)))
		log.Printf("serving frontend from %s", cfg.Server.Static)
	}

	log.Printf("FF5-Multiplayer server listening on %s", cfg.Server.Addr)
	if err := http.ListenAndServe(cfg.Server.Addr, mux); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}
