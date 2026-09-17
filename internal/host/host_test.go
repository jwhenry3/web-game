package host_test

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"clara-mundi/internal/cluster"
	"clara-mundi/internal/game"
	"clara-mundi/internal/host"
	"clara-mundi/internal/servercfg"
)

func TestStartAndCloseStandalone(t *testing.T) {
	if err := host.EnsureWorkingDir(); err != nil {
		t.Skip(err)
	}
	opts := host.StandaloneOptions()
	if filepath.Base(opts.AccountsFile) != "accounts.json" {
		t.Fatalf("accounts path = %q", opts.AccountsFile)
	}
	if filepath.Base(opts.ProfilesFile) != "profiles.json" {
		t.Fatalf("profiles path = %q", opts.ProfilesFile)
	}
	rt, err := host.Start(opts)
	if err != nil {
		t.Fatal(err)
	}
	defer rt.Close()

	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Get(rt.BaseURL + "/api/maps")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status %d: %s", res.StatusCode, body)
	}
}

func TestDataDirNotEmbedded(t *testing.T) {
	dir := host.DataDir()
	if dir == "" {
		t.Fatal("empty data dir")
	}
	if !filepath.IsAbs(dir) && !strings.Contains(dir, "data") {
		t.Fatalf("unexpected data dir %q", dir)
	}
}

func TestStartWorldMode(t *testing.T) {
	dir := t.TempDir()
	mapPath := filepath.Join(dir, "world.map.json")
	blank, err := game.NewBlankMapConfig(16, 16, 32)
	if err != nil {
		t.Fatal(err)
	}
	if err := game.SaveMapConfig(mapPath, blank); err != nil {
		t.Fatal(err)
	}
	serverPath := filepath.Join(dir, "world.server.json")
	sc := servercfg.Default()
	sc.Server.Addr = ":0"
	sc.Server.Overworld = mapPath
	sc.Server.Data = filepath.Join(dir, "profiles.json")
	sc.Server.Accounts = filepath.Join(dir, "accounts.json")
	if err := servercfg.Save(serverPath, sc); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(sc.Server.Data, []byte("{}"), 0o644)
	_ = os.WriteFile(sc.Server.Accounts, []byte("[]"), 0o644)

	cfg := cluster.Config{
		Proxy: cluster.ProxyConfig{
			Name:     "World Test",
			Addr:     "127.0.0.1:0",
			Data:     sc.Server.Data,
			Accounts: sc.Server.Accounts,
		},
		Exp: game.DefaultExpRates(),
		Maps: []cluster.MapSpec{
			{ID: "legacy", Name: "Legacy", Config: serverPath, Default: true, Enabled: cluster.BoolPtr(true)},
		},
		World: &cluster.WorldSpec{ID: "world", Name: "Test World", Config: serverPath},
	}
	clusterPath := filepath.Join(dir, "cluster.json")
	if err := cluster.Save(clusterPath, cfg); err != nil {
		t.Fatal(err)
	}

	opts := host.Options{
		ClusterFile:  clusterPath,
		ListenAddr:   "127.0.0.1:0",
		AccountsFile: sc.Server.Accounts,
		ProfilesFile: sc.Server.Data,
		SkipSeed:     true,
		Quiet:        true,
	}
	rt, err := host.Start(opts)
	if err != nil {
		t.Fatal(err)
	}
	defer rt.Close()
	if !rt.Config.HasWorld() {
		t.Fatal("expected world config")
	}
	if len(rt.Config.Maps) != 1 {
		t.Fatalf("expected legacy maps preserved, got %d", len(rt.Config.Maps))
	}

	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Get(rt.BaseURL + "/api/status")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status %d: %s", res.StatusCode, body)
	}
	var snap struct {
		OK        bool `json:"ok"`
		WorldMode bool `json:"world_mode"`
		Maps      []struct {
			ID      string `json:"id"`
			Enabled bool   `json:"enabled"`
			Running bool   `json:"running"`
		} `json:"maps"`
	}
	if err := json.NewDecoder(res.Body).Decode(&snap); err != nil {
		t.Fatal(err)
	}
	if !snap.WorldMode {
		t.Fatal("status should report world_mode in singular-world mode")
	}
	if len(snap.Maps) != 1 || snap.Maps[0].ID != "world" || !snap.Maps[0].Enabled || !snap.Maps[0].Running {
		t.Fatalf("world status maps = %+v, want only the running world entry", snap.Maps)
	}

	res, err = client.Get(rt.BaseURL + "/api/atlas")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("atlas status %d: %s", res.StatusCode, body)
	}
	var atlas struct {
		Maps []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"maps"`
	}
	if err := json.NewDecoder(res.Body).Decode(&atlas); err != nil {
		t.Fatal(err)
	}
	if len(atlas.Maps) != 1 || atlas.Maps[0].ID != "world" {
		t.Fatalf("world atlas maps = %+v, want only the world entry", atlas.Maps)
	}
}
