// Package host boots the multiplayer cluster (proxy + map nodes).
// Used by cmd/server and by the Wails desktop client in standalone mode.
package host

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"clara-mundi/data"
	"clara-mundi/internal/auth"
	"clara-mundi/internal/cluster"
	"clara-mundi/internal/game"
	"clara-mundi/internal/mapnode"
	"clara-mundi/internal/proxy"
	"clara-mundi/internal/store"
)

// Options configure a cluster host.
type Options struct {
	// ClusterFile is the path to data/cluster.json (default: data/cluster.json).
	ClusterFile string
	// JWTSecret signs auth tokens. Empty → ephemeral (dev/standalone).
	JWTSecret string
	// AdminSecret overrides ADMIN_SECRET for legacy admin key auth.
	AdminSecret string
	// ListenAddr overrides cfg.Proxy.Addr (e.g. "127.0.0.1:0" for ephemeral).
	ListenAddr string
	// AccountsFile / ProfilesFile override persistence paths (standalone testing).
	AccountsFile string
	ProfilesFile string
	// StaticDir overrides static file root (optional; empty keeps cluster config).
	StaticDir string
	// Quiet suppresses startup banners when embedded in a desktop app.
	Quiet bool
	// SkipSeed skips materializing embedded stock data (tests that manage files themselves).
	SkipSeed bool
}

// Runtime is a running cluster. Call Close to shut down.
type Runtime struct {
	Proxy   *proxy.Proxy
	Config  cluster.Config
	BaseURL string // e.g. http://127.0.0.1:8080

	mu     sync.Mutex
	nodes  []*mapnode.Node
	http   *http.Server
	ln     net.Listener
	closed bool
}

// Start loads cluster config, starts enabled map nodes, and begins serving.
func Start(opts Options) (*Runtime, error) {
	if !opts.SkipSeed {
		if err := PrepareInstallRoot(); err != nil {
			return nil, err
		}
	}
	if opts.ClusterFile == "" {
		opts.ClusterFile = "data/cluster.json"
	}
	cfg, err := cluster.Load(opts.ClusterFile)
	if err != nil {
		return nil, fmt.Errorf("cluster: %w", err)
	}
	if opts.ListenAddr != "" {
		cfg.Proxy.Addr = opts.ListenAddr
	}
	if opts.AccountsFile != "" {
		cfg.Proxy.Accounts = opts.AccountsFile
	}
	if opts.ProfilesFile != "" {
		cfg.Proxy.Data = opts.ProfilesFile
	}
	if opts.StaticDir != "" {
		cfg.Proxy.Static = opts.StaticDir
	}

	game.ConfigureExp(cfg.Exp)
	if !opts.Quiet {
		log.Printf("exp rates: ×%.2f  main %d%% / sub %d%%  subjob unlock Lv%d",
			cfg.Exp.Rate, cfg.Exp.MainPercent, cfg.Exp.SubPercent, cfg.Exp.SubjobUnlockLevel)
	}

	secret := opts.JWTSecret
	if secret == "" {
		secret = os.Getenv("JWT_SECRET")
	}
	if secret == "" {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			return nil, err
		}
		secret = hex.EncodeToString(b)
		if !opts.Quiet {
			log.Printf("warning: using ephemeral JWT secret; set JWT_SECRET for stable tokens")
		}
	}

	adminSecret := opts.AdminSecret
	if adminSecret == "" {
		adminSecret = os.Getenv("ADMIN_SECRET")
	}

	profiles := store.Load(cfg.Proxy.Data)
	accounts := store.LoadAccounts(cfg.Proxy.Accounts)
	accounts.EnsureDefaultAdmin()
	tokens := auth.NewTokenIssuer(secret)
	px := proxy.New(cfg, opts.ClusterFile, tokens, accounts, profiles, adminSecret)

	if !opts.Quiet {
		if cfg.Proxy.Name != "" {
			log.Printf("proxy: %s", cfg.Proxy.Name)
		}
		log.Printf("accounts: %s", cfg.Proxy.Accounts)
		log.Printf("profiles: %s", cfg.Proxy.Data)
		log.Printf("cluster: %s", opts.ClusterFile)
	}

	rt := &Runtime{Proxy: px, Config: cfg}
	started := 0
	for _, spec := range cfg.Maps {
		if !spec.IsEnabled() {
			if !opts.Quiet {
				log.Printf("map %s (%s) disabled — not starting", spec.ID, spec.Name)
			}
			continue
		}
		n, err := mapnode.Start(spec, profiles, accounts)
		if err != nil {
			rt.Close()
			return nil, fmt.Errorf("map %s: %w", spec.ID, err)
		}
		px.RegisterMap(n)
		rt.nodes = append(rt.nodes, n)
		started++
	}

	ln, err := net.Listen("tcp", cfg.Proxy.Addr)
	if err != nil {
		rt.Close()
		return nil, fmt.Errorf("listen %s: %w", cfg.Proxy.Addr, err)
	}
	rt.ln = ln
	addr := ln.Addr().String()
	rt.BaseURL = "http://" + normalizeLoopback(addr)
	rt.http = &http.Server{Handler: px.Handler()}

	if !opts.Quiet {
		log.Printf("cluster maps: %d running / %d registered (default %s)", started, len(cfg.Maps), cfg.DefaultMap().ID)
		log.Printf("Clara Mundi proxy listening on %s", addr)
	}

	go func() {
		if err := rt.http.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("host serve: %v", err)
		}
	}()

	return rt, nil
}

// Close stops the HTTP server and all map hubs.
func (rt *Runtime) Close() error {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	if rt.closed {
		return nil
	}
	rt.closed = true

	var first error
	if rt.http != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := rt.http.Shutdown(ctx); err != nil && first == nil {
			first = err
		}
	} else if rt.ln != nil {
		_ = rt.ln.Close()
	}
	for _, n := range rt.nodes {
		n.Stop()
	}
	rt.nodes = nil
	return first
}

func normalizeLoopback(addr string) string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	return net.JoinHostPort(host, port)
}

const clusterMarker = "data/cluster.json"

// findRepoRootFrom walks up from start looking for data/cluster.json.
func findRepoRootFrom(start string) (string, error) {
	dir := start
	for {
		if _, err := os.Stat(filepath.Join(dir, "data", "cluster.json")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("%s not found above %s", clusterMarker, start)
}

// FindRepoRoot walks up from cwd (and the executable dir) looking for data/cluster.json.
func FindRepoRoot() (string, error) {
	var starts []string
	if cwd, err := os.Getwd(); err == nil {
		starts = append(starts, cwd)
	}
	if dir := exeDir(); dir != "" {
		starts = append(starts, dir)
	}
	var lastErr error
	seen := map[string]bool{}
	for _, start := range starts {
		start = filepath.Clean(start)
		if seen[start] {
			continue
		}
		seen[start] = true
		root, err := findRepoRootFrom(start)
		if err == nil {
			return root, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", fmt.Errorf("%s not found", clusterMarker)
}

// InstallRoot is the directory that contains the portable data/ tree.
// Production standalone uses the executable directory; otherwise the repo root.
func InstallRoot() (string, error) {
	if WantStandaloneBuild() {
		if dir := exeDir(); dir != "" {
			return dir, nil
		}
	}
	if root, err := FindRepoRoot(); err == nil {
		return root, nil
	}
	if dir := exeDir(); dir != "" {
		return dir, nil
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	return cwd, nil
}

// PrepareInstallRoot materializes embedded stock data (if missing) and chdirs to the install root.
func PrepareInstallRoot() error {
	root, err := InstallRoot()
	if err != nil {
		return err
	}
	if err := data.Materialize(root); err != nil {
		return err
	}
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	if filepath.Clean(cwd) == filepath.Clean(root) {
		return nil
	}
	return os.Chdir(root)
}

// EnsureWorkingDir changes into the install/repo root when not already there.
func EnsureWorkingDir() error {
	return PrepareInstallRoot()
}

// exeDir returns the directory containing the running executable.
func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return filepath.Dir(exe)
}

// DataDir is the on-disk folder for mutable player data (accounts + profiles JSON).
// These files are never embedded in the binary — only loaded/saved via the filesystem.
//
// Resolution order:
//  1. FANTASY_DATA_DIR
//  2. Production standalone (-tags standalone): <exeDir>/data
//  3. Dev / repo checkout: <repo>/data/standalone
//  4. <exeDir>/data fallback
func DataDir() string {
	if v := strings.TrimSpace(os.Getenv("FANTASY_DATA_DIR")); v != "" {
		return filepath.Clean(v)
	}
	if WantStandaloneBuild() {
		if dir := exeDir(); dir != "" {
			return filepath.Join(dir, "data")
		}
	}
	if root, err := FindRepoRoot(); err == nil {
		return filepath.Join(root, "data", "standalone")
	}
	if dir := exeDir(); dir != "" {
		return filepath.Join(dir, "data")
	}
	return filepath.Join("data", "standalone")
}

// StandaloneOptions returns Options for an in-process server on an ephemeral port.
// Player saves are external JSON under DataDir(); stock assets are seeded from the binary when absent.
func StandaloneOptions() Options {
	dir := DataDir()
	cluster := "data/cluster.json"
	if root, err := InstallRoot(); err == nil {
		cluster = filepath.Join(root, "data", "cluster.json")
	}
	return Options{
		ClusterFile:  cluster,
		ListenAddr:   "127.0.0.1:0",
		AccountsFile: filepath.Join(dir, "accounts.json"),
		ProfilesFile: filepath.Join(dir, "profiles.json"),
		StaticDir:    "",
		Quiet:        false,
	}
}

// WantStandalone reports whether the process should embed a game server.
// True when FANTASY_STANDALONE is 1/true/yes, or when built with -tags standalone
// (see WantStandaloneBuild).
func WantStandalone() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("FANTASY_STANDALONE")))
	if v == "1" || v == "true" || v == "yes" {
		return true
	}
	return WantStandaloneBuild()
}
