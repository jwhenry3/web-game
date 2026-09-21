package proxy

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"clara-mundi/internal/auth"
	"clara-mundi/internal/cluster"
	"clara-mundi/internal/game"
	"clara-mundi/internal/servercfg"
	"clara-mundi/internal/store"
)

// AdminMapsHandler serves map override and lifecycle admin APIs.
type AdminMapsHandler struct {
	Secret   string
	Accounts *store.AccountStore
	Tokens   *auth.TokenIssuer
	Proxy    *Proxy
}

func (h *AdminMapsHandler) checkAuth(w http.ResponseWriter, r *http.Request) bool {
	if h.Accounts != nil && h.Tokens != nil {
		token := bearerAdminToken(r)
		if token != "" {
			claims, err := h.Tokens.Parse(token)
			if err == nil && h.Accounts.IsAdmin(claims.AccountID) {
				return true
			}
		}
	}
	if h.Secret != "" {
		key := r.Header.Get("X-Admin-Key")
		if key == "" {
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				key = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}
		if key == h.Secret {
			return true
		}
	}
	http.Error(w, "unauthorized", http.StatusUnauthorized)
	return false
}

func bearerAdminToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

func (h *AdminMapsHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/admin/maps", h.handleMaps)
	mux.HandleFunc("/admin/maps/", h.handleMapByID)
	mux.HandleFunc("/admin/restart", h.handleRestart)
}

// handleRestart reboots the whole cluster in place — every map node, store,
// and the HTTP listener is rebuilt from on-disk config. The response flushes
// before the restart begins; clients should poll /api/status for readiness.
func (h *AdminMapsHandler) handleRestart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !h.checkAuth(w, r) {
		return
	}
	restart := h.Proxy.RestartFunc()
	if restart == nil {
		http.Error(w, "restart not supported", http.StatusNotImplemented)
		return
	}
	writeAdminJSON(w, map[string]string{"status": "restarting"})
	go func() {
		time.Sleep(200 * time.Millisecond)
		log.Printf("admin: restarting cluster")
		if err := restart(); err != nil {
			log.Printf("admin: cluster restart failed: %v", err)
		}
	}()
}

func (h *AdminMapsHandler) handleMaps(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/admin/maps" {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		if !h.checkAuth(w, r) {
			return
		}
		specs := h.Proxy.ClusterMaps()
		list := make([]adminMapInfo, 0, len(specs))
		for _, spec := range specs {
			info, err := h.mapInfo(spec)
			if err != nil {
				// Keep the list usable even if one map's files are broken.
				list = append(list, adminMapInfo{
					ID:      spec.ID,
					Name:    spec.Name,
					Enabled: spec.IsEnabled(),
					Running: h.Proxy.mapRunning(spec.ID),
					Default: spec.Default,
				})
				continue
			}
			list = append(list, info)
		}
		writeAdminJSON(w, list)
	case http.MethodPost:
		if !h.checkAuth(w, r) {
			return
		}
		var body CreateMapRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		log.Printf("admin: create map request id=%q name=%q %dx%d", body.ID, body.Name, body.Cols, body.Rows)
		spec, err := h.Proxy.CreateMap(body)
		if err != nil {
			log.Printf("admin: create map failed: %v", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		info, err := h.mapInfo(spec)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeAdminJSON(w, info)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *AdminMapsHandler) handleMapByID(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/admin/maps/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	mapID := parts[0]
	spec, ok := h.findMap(mapID)
	if !ok {
		http.Error(w, "map not found", http.StatusNotFound)
		return
	}

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			if !h.checkAuth(w, r) {
				return
			}
			info, err := h.mapInfo(spec)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeAdminJSON(w, info)
		case http.MethodDelete:
			if !h.checkAuth(w, r) {
				return
			}
			if err := h.Proxy.RemoveMap(mapID); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			writeAdminJSON(w, map[string]string{"status": "ok"})
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}

	switch parts[1] {
	case "overrides":
		h.handleOverrides(w, r, mapID)
	case "scene3d":
		h.handleScene3D(w, r, mapID, spec)
	case "server":
		h.handleServerConfig(w, r, mapID)
	case "enable":
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !h.checkAuth(w, r) {
			return
		}
		if err := h.Proxy.EnableMap(mapID); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		spec, _ = h.findMap(mapID)
		info, err := h.mapInfo(spec)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeAdminJSON(w, info)
	case "disable":
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !h.checkAuth(w, r) {
			return
		}
		if err := h.Proxy.DisableMap(mapID); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		spec, _ = h.findMap(mapID)
		info, err := h.mapInfo(spec)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeAdminJSON(w, info)
	default:
		http.NotFound(w, r)
	}
}

func (h *AdminMapsHandler) handleServerConfig(w http.ResponseWriter, r *http.Request, mapID string) {
	switch r.Method {
	case http.MethodGet:
		if !h.checkAuth(w, r) {
			return
		}
		info, err := h.Proxy.MapServerInfo(mapID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeAdminJSON(w, info)
	case http.MethodPut:
		if !h.checkAuth(w, r) {
			return
		}
		var body MapServerUpdate
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		info, err := h.Proxy.UpdateMapServer(mapID, body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeAdminJSON(w, info)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *AdminMapsHandler) handleOverrides(w http.ResponseWriter, r *http.Request, mapID string) {
	switch r.Method {
	case http.MethodGet:
		if !h.checkAuth(w, r) {
			return
		}
		o, err := game.LoadMapOverride(mapID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if o == nil {
			writeAdminJSON(w, game.MapTileOverrides{MapID: mapID, Layers: map[string]map[string]int{}})
			return
		}
		writeAdminJSON(w, o)
	case http.MethodPut:
		if !h.checkAuth(w, r) {
			return
		}
		var body game.MapTileOverrides
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		body.MapID = mapID
		if err := game.SaveMapOverride(&body); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := h.reloadMap(mapID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeAdminJSON(w, map[string]string{"status": "ok"})
	case http.MethodDelete:
		if !h.checkAuth(w, r) {
			return
		}
		if err := game.DeleteMapOverride(mapID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := h.reloadMap(mapID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeAdminJSON(w, map[string]string{"status": "ok"})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleScene3D serves and persists the authored 3D scene layer. The document
// lives beside the overworld file (<map>.scene3d.json); a save validates it
// against the map's dimensions, writes it atomically, and hot-reloads the
// running node so terrain edits reach live physics and connected clients.
func (h *AdminMapsHandler) handleScene3D(w http.ResponseWriter, r *http.Request, mapID string, spec cluster.MapSpec) {
	switch r.Method {
	case http.MethodGet:
		if !h.checkAuth(w, r) {
			return
		}
		scene, err := h.sceneFor(mapID, spec)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeAdminJSON(w, scene)
	case http.MethodPut:
		if !h.checkAuth(w, r) {
			return
		}
		cfg, err := servercfg.Load(spec.Config)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var doc game.Scene3D
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<20)).Decode(&doc); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		doc.Map = mapID
		cols, rows, err := game.OverworldDims(cfg.Server.Overworld)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := doc.Validate(cols, rows); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := game.SaveScene3D(game.Scene3DPath(cfg.Server.Overworld), &doc); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := h.reloadMap(mapID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeAdminJSON(w, &doc)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// sceneFor returns the live scene from the running node when available,
// falling back to the file on disk (or an empty document) for stopped maps.
func (h *AdminMapsHandler) sceneFor(mapID string, spec cluster.MapSpec) (*game.Scene3D, error) {
	h.Proxy.mu.Lock()
	n := h.Proxy.maps[mapID]
	if n == nil && h.Proxy.world != nil && h.Proxy.world.Spec.ID == mapID {
		n = h.Proxy.world
	}
	h.Proxy.mu.Unlock()
	if n != nil && n.OW != nil && n.OW.Scene3D != nil {
		return n.OW.Scene3D, nil
	}
	cfg, err := servercfg.Load(spec.Config)
	if err != nil {
		return nil, err
	}
	cols, rows, err := game.OverworldDims(cfg.Server.Overworld)
	if err != nil {
		return nil, err
	}
	scene, err := game.LoadScene3D(game.Scene3DPath(cfg.Server.Overworld), cols, rows)
	if err != nil {
		return nil, err
	}
	if scene == nil {
		scene = game.EmptyScene3D(mapID)
	}
	return scene, nil
}

func (h *AdminMapsHandler) reloadMap(mapID string) error {
	h.Proxy.mu.Lock()
	n := h.Proxy.maps[mapID]
	if n == nil && h.Proxy.world != nil && h.Proxy.world.Spec.ID == mapID {
		n = h.Proxy.world
	}
	worldMode := h.Proxy.cfg.HasWorld()
	h.Proxy.mu.Unlock()
	if n == nil {
		if worldMode {
			// No legacy map nodes run in singular-world mode; the override is
			// already persisted and applies on the next legacy-mode boot.
			return nil
		}
		return fmt.Errorf("map node %q not running", mapID)
	}
	return n.ReloadOverworld()
}

func (h *AdminMapsHandler) findMap(id string) (cluster.MapSpec, bool) {
	for _, spec := range h.Proxy.ClusterMaps() {
		if spec.ID == id {
			return spec, true
		}
	}
	// The singular world isn't part of cfg.Maps but is addressable by its
	// spec id everywhere the admin API takes one (scene save, overrides...).
	if w, ok := h.Proxy.cfg.WorldSpec(); ok && w.ID == id {
		return cluster.MapSpec{ID: w.ID, Name: w.Name, Config: w.Config, Default: true, Enabled: cluster.BoolPtr(true)}, true
	}
	return cluster.MapSpec{}, false
}

type adminMapInfo struct {
	ID                string                 `json:"id"`
	Name              string                 `json:"name"`
	Overworld         string                 `json:"overworld"`
	Cols              int                    `json:"cols"`
	Rows              int                    `json:"rows"`
	TileSize          int                    `json:"tile_size"`
	Enabled           bool                   `json:"enabled"`
	Running           bool                   `json:"running"`
	Default           bool                   `json:"default"`
	BaseTerrainLayers *terrainLayersPayload  `json:"base_terrain_layers"`
	TerrainLayers     *terrainLayersPayload  `json:"terrain_layers"`
	BaseObjects       []game.OverrideObject  `json:"base_objects"`
	Objects           []game.OverrideObject  `json:"objects"`
	Overrides         *game.MapTileOverrides `json:"overrides,omitempty"`
	HasOverride       bool                   `json:"has_override"`
}

type terrainLayersPayload struct {
	Ground    []int `json:"ground"`
	Collision []int `json:"collision"`
}

func (h *AdminMapsHandler) mapInfo(spec cluster.MapSpec) (adminMapInfo, error) {
	cfg, err := servercfg.Load(spec.Config)
	if err != nil {
		return adminMapInfo{}, err
	}
	baseTerrain, baseObjects, err := game.MapConfigBase(cfg.Server.Overworld)
	if err != nil {
		return adminMapInfo{}, err
	}
	ow, err := game.LoadOverworldData(cfg.Server.Overworld)
	if err != nil {
		return adminMapInfo{}, err
	}
	override, err := game.LoadMapOverride(spec.ID)
	if err != nil {
		return adminMapInfo{}, err
	}
	objects := ow.Objects
	if len(objects) == 0 {
		objects = baseObjects
	}
	info := adminMapInfo{
		ID:        spec.ID,
		Name:      spec.Name,
		Overworld: cfg.Server.Overworld,
		Cols:      ow.Cols,
		Rows:      ow.Rows,
		TileSize:  ow.TileSize,
		Enabled:   spec.IsEnabled(),
		Running:   h.Proxy.mapRunning(spec.ID),
		Default:   spec.Default,
		BaseTerrainLayers: &terrainLayersPayload{
			Ground:    append([]int(nil), baseTerrain.Ground...),
			Collision: append([]int(nil), baseTerrain.Collision...),
		},
		TerrainLayers: &terrainLayersPayload{
			Ground:    append([]int(nil), ow.Ground...),
			Collision: append([]int(nil), ow.Collision...),
		},
		BaseObjects: append([]game.OverrideObject(nil), baseObjects...),
		Objects:     append([]game.OverrideObject(nil), objects...),
	}
	if override != nil && (len(override.Layers) > 0 || len(override.Objects) > 0) {
		info.Overrides = override
		info.HasOverride = true
	}
	return info, nil
}

func writeAdminJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
