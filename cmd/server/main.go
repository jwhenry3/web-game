package main

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"log"
	"net/http"
	"os"

	"ffv-web-game/internal/auth"
	"ffv-web-game/internal/cluster"
	"ffv-web-game/internal/mapnode"
	"ffv-web-game/internal/proxy"
	"ffv-web-game/internal/store"
)

func main() {
	clusterFile := flag.String("cluster", "config/cluster.json", "cluster configuration (proxy + maps)")
	configFile := flag.String("config", "", "legacy single-map server.json (optional)")
	jwtSecret := flag.String("jwt-secret", "", "JWT signing secret (required in production)")
	flag.Parse()

	path := *clusterFile
	if _, err := os.Stat(path); err != nil && *configFile != "" {
		log.Fatalf("cluster config %s not found (legacy -config is unused in cluster mode)", path)
	}

	cfg, err := cluster.Load(path)
	if err != nil {
		log.Fatalf("cluster: %v", err)
	}

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

	profiles := store.Load(cfg.Proxy.Data)
	accounts := store.LoadAccounts(cfg.Proxy.Accounts)
	tokens := auth.NewTokenIssuer(secret)
	px := proxy.New(cfg, tokens, accounts, profiles)

	if cfg.Proxy.Name != "" {
		log.Printf("proxy: %s", cfg.Proxy.Name)
	}
	for _, spec := range cfg.Maps {
		n, err := mapnode.Start(spec, profiles, accounts)
		if err != nil {
			log.Fatalf("map %s: %v", spec.ID, err)
		}
		px.RegisterMap(n)
	}

	log.Printf("cluster maps: %d (default %s)", len(cfg.Maps), cfg.DefaultMap().ID)
	log.Printf("FF5-Multiplayer proxy listening on %s", cfg.Proxy.Addr)
	if err := http.ListenAndServe(cfg.Proxy.Addr, px.Handler()); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}
