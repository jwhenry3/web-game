package proxy

import (
	"encoding/json"
	"io"
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
	n, profiles, accounts, _ := newTestNodeAt(t)
	return n, profiles, accounts
}

// newTestNodeAt is newTestNode plus the node's server.json path, for tests
// that must address the node through cluster specs (scene admin routes).
func newTestNodeAt(t *testing.T) (*mapnode.Node, *store.Store, *store.AccountStore, string) {
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
	return n, profiles, accounts, serverPath
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

// The editor's scene3d save/load cycle runs through the admin route; the
// runtime and editor fetch the same document through the public read-only
// route. Exercises the singular-world resolution (no legacy map nodes run).
func TestScene3DEndpoints(t *testing.T) {
	n, profiles, accounts, serverPath := newTestNodeAt(t)
	p := New(cluster.Config{
		World: &cluster.WorldSpec{ID: n.Spec.ID, Name: n.Spec.Name, Config: serverPath},
	}, "", nil, accounts, profiles, "secret")
	p.RegisterWorld(n)

	serve := func(req *httptest.ResponseRecorder, method, path, key string, body any) *httptest.ResponseRecorder {
		var rdr io.Reader
		if body != nil {
			raw, err := json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
			rdr = strings.NewReader(string(raw))
		}
		r := httptest.NewRequest(method, path, rdr)
		if key != "" {
			r.Header.Set("X-Admin-Key", key)
		}
		p.Handler().ServeHTTP(req, r)
		return req
	}

	// Public scene read: an unauthored map answers an empty doc, not a 404.
	rec := serve(httptest.NewRecorder(), http.MethodGet, "/api/maps/testworld/scene3d", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("public scene3d status %d: %s", rec.Code, rec.Body.String())
	}
	var doc game.Scene3D
	if err := json.NewDecoder(rec.Body).Decode(&doc); err != nil {
		t.Fatal(err)
	}
	if doc.Map != "testworld" || doc.Terrain.Heights == nil {
		t.Fatalf("public scene3d doc = %+v", doc)
	}

	// Writes need the admin key.
	rec = serve(httptest.NewRecorder(), http.MethodPut, "/api/admin/maps/testworld/scene3d", "", doc)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated PUT status %d", rec.Code)
	}

	doc.Terrain.Heights = map[string]float64{"0,0": 5}
	doc.Terrain.Cells = map[string]string{"2,3": "H"}
	doc.Objects = []game.SceneObject{{
		ID: "rock1", Name: "Rock", Prefab: "rock", Visible: true,
		Transform: game.SceneTransform{Position: [3]float64{4, 0, 4}, Scale: [3]float64{1, 1, 1}},
		Components: game.SceneComponents{Collider: &game.SceneCollider{
			Enabled: true, Shape: "box", Size: [3]float64{1, 1, 1}, Offset: [3]float64{0, 0.5, 0},
		}},
	}}
	rec = serve(httptest.NewRecorder(), http.MethodPut, "/api/admin/maps/testworld/scene3d", "secret", doc)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT scene3d status %d: %s", rec.Code, rec.Body.String())
	}

	// The save is persisted beside the overworld file and hot-reloaded into
	// the running world node — authored terrain cells hit live collision.
	scenePath := filepath.Join(filepath.Dir(serverPath), "test.scene3d.json")
	if _, err := os.Stat(scenePath); err != nil {
		t.Fatalf("scene file missing: %v", err)
	}
	if n.OW.Scene3D == nil || len(n.OW.Scene3D.Objects) != 1 {
		t.Fatalf("reloaded scene = %+v", n.OW.Scene3D)
	}
	if got := n.OW.Cells[3][2]; got != 'H' {
		t.Fatalf("terrain cell (2,3) = %q, want H", got)
	}

	// The same document round-trips through the public route.
	rec = serve(httptest.NewRecorder(), http.MethodGet, "/api/maps/testworld/scene3d", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("public scene3d after save status %d", rec.Code)
	}
	var got game.Scene3D
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if len(got.Objects) != 1 || got.Objects[0].ID != "rock1" || got.Terrain.Heights["0,0"] != 5 {
		t.Fatalf("round-trip doc = %+v", got)
	}

	// Out-of-bounds terrain keys are rejected, not saved.
	doc.Terrain.Cells = map[string]string{"99,99": "H"}
	rec = serve(httptest.NewRecorder(), http.MethodPut, "/api/admin/maps/testworld/scene3d", "secret", doc)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid terrain PUT status %d", rec.Code)
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
