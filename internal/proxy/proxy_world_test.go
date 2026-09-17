package proxy

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"clara-mundi/internal/cluster"
	"clara-mundi/internal/game"
	"clara-mundi/internal/mapnode"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/servercfg"
	"clara-mundi/internal/store"
)

// newTestNode creates a running mapnode backed by a blank map. It is used in
// proxy tests as a stand-in for either a legacy map node or a world node.
func newTestNode(t *testing.T) (*mapnode.Node, *store.Store, *store.AccountStore) {
	t.Helper()
	dir := t.TempDir()
	profilesPath := filepath.Join(dir, "profiles.json")
	accountsPath := filepath.Join(dir, "accounts.json")
	profiles := store.Load(profilesPath)
	accounts := store.LoadAccounts(accountsPath)
	mapPath := filepath.Join(dir, "test.map.json")
	blank, err := game.NewBlankMapConfig(16, 16, 32)
	if err != nil {
		t.Fatal(err)
	}
	if err := game.SaveMapConfig(mapPath, blank); err != nil {
		t.Fatal(err)
	}
	serverPath := filepath.Join(dir, "server.json")
	cfg := servercfg.Default()
	cfg.Server.Addr = ":0"
	cfg.Server.Overworld = mapPath
	cfg.Server.Data = profilesPath
	cfg.Server.Accounts = accountsPath
	if err := servercfg.Save(serverPath, cfg); err != nil {
		t.Fatal(err)
	}
	n, err := mapnode.Start(cluster.MapSpec{
		ID:      "testworld",
		Name:    "Test World",
		Config:  serverPath,
		Default: true,
		Enabled: cluster.BoolPtr(true),
	}, profiles, accounts, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		n.Stop()
		profiles.Close()
	})
	return n, profiles, accounts
}

func TestRegisterWorldAttachesAllSessions(t *testing.T) {
	n, profiles, accounts := newTestNode(t)
	p := New(cluster.Config{}, "", nil, accounts, profiles, "")
	p.RegisterWorld(n)
	if p.world != n {
		t.Fatal("world node not stored on proxy")
	}

	s := &session{id: "s1", send: make(chan []byte, 4)}
	addSession(p, s)
	p.route(s, protocol.Envelope{Type: protocol.TypeJoinWorld, Payload: []byte(`{}`)})
	if s.mapID != n.Spec.ID {
		t.Fatalf("session mapID = %q, want %q", s.mapID, n.Spec.ID)
	}
	waitForwarded(t, s)

	// Registration is asynchronous on the hub loop; give it a moment.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		for _, id := range n.SessionIDs() {
			if id == s.id {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("session never attached to world node")
}

// addSession registers a test session with the proxy so hub replies are
// forwarded to s.send (handleWS normally does this for real connections).
func addSession(p *Proxy, s *session) {
	p.mu.Lock()
	p.sess[s.id] = s
	p.mu.Unlock()
}

// waitForwarded blocks until the node forwards a hub reply for the session
// (e.g. the join error). It keeps the queued join event fully processed before
// test cleanup stops the node, avoiding a send on a closed client channel.
func waitForwarded(t *testing.T, s *session) {
	t.Helper()
	select {
	case <-s.send:
	case <-time.After(2 * time.Second):
		t.Fatal("no reply forwarded to session")
	}
}

func TestWorldModeIgnoresMapSelection(t *testing.T) {
	n, profiles, accounts := newTestNode(t)
	p := New(cluster.Config{}, "", nil, accounts, profiles, "")
	p.RegisterWorld(n)

	s := &session{id: "s2", send: make(chan []byte, 4)}
	addSession(p, s)
	payload, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: "Ignored"})
	p.route(s, protocol.Envelope{Type: protocol.TypeJoinWorld, Payload: payload})
	if s.mapID != n.Spec.ID {
		t.Fatalf("session mapID = %q, want %q", s.mapID, n.Spec.ID)
	}
	waitForwarded(t, s)
}

func TestLegacyModeStillUsesMapSelection(t *testing.T) {
	n, profiles, accounts := newTestNode(t)
	p := New(cluster.Config{
		Maps: []cluster.MapSpec{
			{ID: n.Spec.ID, Name: n.Spec.Name, Config: "irrelevant", Default: true, Enabled: cluster.BoolPtr(true)},
		},
	}, "", nil, accounts, profiles, "")
	p.RegisterMap(n)
	if p.world != nil {
		t.Fatal("legacy mode should not set world")
	}

	s := &session{id: "s3", send: make(chan []byte, 4)}
	addSession(p, s)
	payload, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: "Test"})
	p.route(s, protocol.Envelope{Type: protocol.TypeJoinWorld, Payload: payload})
	if s.mapID != n.Spec.ID {
		t.Fatalf("legacy session mapID = %q, want %q", s.mapID, n.Spec.ID)
	}
	waitForwarded(t, s)
}

func fetchAtlas(t *testing.T, p *Proxy) protocol.AtlasPayload {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/atlas", nil)
	p.handleAtlas(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("atlas status %d: %s", rec.Code, rec.Body.String())
	}
	var payload protocol.AtlasPayload
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	return payload
}

func TestAtlasWorldModeReturnsWorldOnly(t *testing.T) {
	n, profiles, accounts := newTestNode(t)
	p := New(cluster.Config{
		Maps: []cluster.MapSpec{
			// Legacy specs stay registered but are never running in world mode.
			{ID: "legacy_a", Name: "Legacy A", Config: "unused", Default: true, Enabled: cluster.BoolPtr(true)},
			{ID: "legacy_b", Name: "Legacy B", Config: "unused", Enabled: cluster.BoolPtr(true)},
		},
		World: &cluster.WorldSpec{ID: n.Spec.ID, Name: n.Spec.Name, Config: n.Spec.Config},
	}, "", nil, accounts, profiles, "")
	p.RegisterWorld(n)

	payload := fetchAtlas(t, p)
	if len(payload.Maps) != 1 {
		t.Fatalf("atlas maps = %d, want exactly the world entry", len(payload.Maps))
	}
	if payload.Maps[0].ID != n.Spec.ID {
		t.Fatalf("atlas map id = %q, want %q", payload.Maps[0].ID, n.Spec.ID)
	}
}

func TestAtlasLegacyModeListsRunningMaps(t *testing.T) {
	n, profiles, accounts := newTestNode(t)
	p := New(cluster.Config{
		Maps: []cluster.MapSpec{
			{ID: n.Spec.ID, Name: n.Spec.Name, Config: "unused", Default: true, Enabled: cluster.BoolPtr(true)},
			// Enabled but not running: must not appear in the atlas.
			{ID: "other", Name: "Other", Config: "unused", Enabled: cluster.BoolPtr(true)},
		},
	}, "", nil, accounts, profiles, "")
	p.RegisterMap(n)

	payload := fetchAtlas(t, p)
	if len(payload.Maps) != 1 || payload.Maps[0].ID != n.Spec.ID {
		t.Fatalf("legacy atlas maps = %+v", payload.Maps)
	}
}

func TestStatusSnapshotWorldModeCountsWorld(t *testing.T) {
	n, profiles, accounts := newTestNode(t)
	p := New(cluster.Config{
		Proxy: cluster.ProxyConfig{Name: "World Cluster"},
		Exp:   game.DefaultExpRates(),
		Maps: []cluster.MapSpec{
			{ID: "legacy_a", Name: "Legacy A", Config: "unused", Default: true, Enabled: cluster.BoolPtr(true)},
		},
		World: &cluster.WorldSpec{ID: n.Spec.ID, Name: n.Spec.Name, Config: n.Spec.Config},
	}, "", nil, accounts, profiles, "")
	p.RegisterWorld(n)

	snap := p.buildStatusSnapshot()
	if !snap.WorldMode {
		t.Fatal("snapshot should report world_mode")
	}
	if len(snap.Maps) != 1 {
		t.Fatalf("world status maps = %+v, want the world entry only", snap.Maps)
	}
	entry := snap.Maps[0]
	if entry.ID != n.Spec.ID || !entry.Enabled || !entry.Running {
		t.Fatalf("world status entry = %+v", entry)
	}

	// An attached (hub-registered) session should be counted on the world.
	// Attach directly to avoid queuing a join event that could race the
	// test-cleanup shutdown in the hub.
	c := n.Attach(cluster.AttachRequest{ClientID: "s9", Username: "tester"})
	if c == nil {
		t.Fatal("attach failed")
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		snap = p.buildStatusSnapshot()
		if snap.Players == 1 && snap.Maps[0].Players == 1 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("world status never counted attached session: %+v", snap)
}

// writeMapServerConfig materializes a blank <id>.map.json + <id>.server.json
// pair under dir and returns the server config path.
func writeMapServerConfig(t *testing.T, dir, id string) string {
	t.Helper()
	mapPath := filepath.Join(dir, id+".map.json")
	blank, err := game.NewBlankMapConfig(16, 16, 32)
	if err != nil {
		t.Fatal(err)
	}
	if err := game.SaveMapConfig(mapPath, blank); err != nil {
		t.Fatal(err)
	}
	serverPath := filepath.Join(dir, id+".server.json")
	sc := servercfg.Default()
	sc.Server.Addr = ":0"
	sc.Server.Overworld = mapPath
	sc.Server.Data = filepath.Join(dir, "profiles.json")
	sc.Server.Accounts = filepath.Join(dir, "accounts.json")
	if err := servercfg.Save(serverPath, sc); err != nil {
		t.Fatal(err)
	}
	return serverPath
}

// In singular-world mode the admin map lifecycle APIs keep registry semantics:
// entries can be created/enabled/disabled for a future legacy boot, but no
// additional map servers ever start.
func TestWorldModeMapLifecycleIsRegistryOnly(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir) // CreateMap + overrides use data/... relative paths
	profilesPath := filepath.Join(dir, "profiles.json")
	accountsPath := filepath.Join(dir, "accounts.json")
	profiles := store.Load(profilesPath)
	accounts := store.LoadAccounts(accountsPath)
	t.Cleanup(profiles.Close)

	havenCfg := writeMapServerConfig(t, dir, "haven")
	wildsCfg := writeMapServerConfig(t, dir, "wilds")
	worldCfg := writeMapServerConfig(t, dir, "world")

	p := New(cluster.Config{
		Proxy: cluster.ProxyConfig{Data: profilesPath, Accounts: accountsPath},
		Exp:   game.DefaultExpRates(),
		Maps: []cluster.MapSpec{
			{ID: "haven", Name: "Haven", Config: havenCfg, Default: true, Enabled: cluster.BoolPtr(true)},
			{ID: "wilds", Name: "Wilds", Config: wildsCfg, Enabled: cluster.BoolPtr(false)},
		},
		World: &cluster.WorldSpec{ID: "world", Name: "World", Config: worldCfg},
	}, "", nil, accounts, profiles, "secret")

	// Enable via the admin API: registry flag flips but nothing starts, and
	// the response must honestly report running=false.
	req := httptest.NewRequest(http.MethodPost, "/api/admin/maps/wilds/enable", nil)
	req.Header.Set("X-Admin-Key", "secret")
	rec := httptest.NewRecorder()
	p.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin enable status %d: %s", rec.Code, rec.Body.String())
	}
	var info adminMapInfo
	if err := json.NewDecoder(rec.Body).Decode(&info); err != nil {
		t.Fatal(err)
	}
	if !info.Enabled || info.Running {
		t.Fatalf("world mode enable info = %+v", info)
	}
	if p.mapRunning("wilds") {
		t.Fatal("world mode enable must not start a map node")
	}
	p.mu.Lock()
	wilds, _ := p.cfg.MapByID("wilds")
	p.mu.Unlock()
	if !wilds.IsEnabled() {
		t.Fatal("enable did not persist the registry flag")
	}

	// Create registers the map (files + cluster registry) without starting it.
	spec, err := p.CreateMap(CreateMapRequest{ID: "newmap", Name: "New Map", Cols: 16, Rows: 16})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if spec.ID != "newmap" || !spec.IsEnabled() {
		t.Fatalf("created spec = %+v", spec)
	}
	if p.mapRunning("newmap") {
		t.Fatal("world mode create must not start a map node")
	}
	if _, err := os.Stat(filepath.Join("data", "maps", "newmap.server.json")); err != nil {
		t.Fatalf("created map server config missing: %v", err)
	}

	// The registry file reflects every change.
	raw, err := os.ReadFile(cluster.MapsRegistryPath(profilesPath))
	if err != nil {
		t.Fatalf("read maps registry: %v", err)
	}
	if !strings.Contains(string(raw), `"newmap"`) {
		t.Fatal("maps registry missing newmap")
	}

	// Disable updates the registry only.
	if err := p.DisableMap("wilds"); err != nil {
		t.Fatalf("disable: %v", err)
	}
	p.mu.Lock()
	wilds, _ = p.cfg.MapByID("wilds")
	p.mu.Unlock()
	if wilds.IsEnabled() {
		t.Fatal("disable did not persist the registry flag")
	}
}

// Legacy mode is unchanged: enabling a map starts its map node.
func TestLegacyModeEnableStartsMap(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	profilesPath := filepath.Join(dir, "profiles.json")
	accountsPath := filepath.Join(dir, "accounts.json")
	profiles := store.Load(profilesPath)
	accounts := store.LoadAccounts(accountsPath)
	t.Cleanup(profiles.Close)

	havenCfg := writeMapServerConfig(t, dir, "haven")
	wildsCfg := writeMapServerConfig(t, dir, "wilds")

	p := New(cluster.Config{
		Proxy: cluster.ProxyConfig{Data: profilesPath, Accounts: accountsPath},
		Exp:   game.DefaultExpRates(),
		Maps: []cluster.MapSpec{
			{ID: "haven", Name: "Haven", Config: havenCfg, Default: true, Enabled: cluster.BoolPtr(true)},
			{ID: "wilds", Name: "Wilds", Config: wildsCfg, Enabled: cluster.BoolPtr(false)},
		},
	}, "", nil, accounts, profiles, "")

	if err := p.EnableMap("wilds"); err != nil {
		t.Fatalf("enable: %v", err)
	}
	if !p.mapRunning("wilds") {
		t.Fatal("legacy enable should start the map node")
	}
	p.mu.Lock()
	n := p.maps["wilds"]
	p.mu.Unlock()
	if n == nil {
		t.Fatal("legacy enable should register the map node")
	}
	t.Cleanup(n.Stop)
}
