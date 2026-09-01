package main

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"log"
	"net/http"
	"os"

	"ffv-web-game/internal/auth"
	"ffv-web-game/internal/server"
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
	addr := flag.String("addr", ":8080", "http listen address")
	dataFile := flag.String("data", "data/profiles.json", "player profile persistence file")
	accountsFile := flag.String("accounts", "data/accounts.json", "account persistence file")
	jwtSecret := flag.String("jwt-secret", "", "JWT signing secret (required in production)")
	staticDir := flag.String("static", "web/dist", "optional static frontend build to serve")
	flag.Parse()

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

	profiles := store.Load(*dataFile)
	accounts := store.LoadAccounts(*accountsFile)
	tokens := auth.NewTokenIssuer(secret)
	hub := server.NewHub(profiles, accounts, tokens)
	go hub.Run()

	authHandler := server.NewAuthHandler(accounts, profiles, tokens, hub)

	apiMux := http.NewServeMux()
	server.RegisterAPIRoutes(apiMux, authHandler)

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

	if info, err := os.Stat(*staticDir); err == nil && info.IsDir() {
		mux.Handle("/", http.FileServer(http.Dir(*staticDir)))
		log.Printf("serving frontend from %s", *staticDir)
	}

	log.Printf("FF5-Multiplayer server listening on %s", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}
