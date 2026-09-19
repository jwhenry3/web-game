package proxy

import (
	"net/http"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// mapImageScale renders each tile as a square block of this many pixels.
// 2px/tile keeps a 1280×960 overworld at 2560×1920 — crisp enough for the
// map window's zoom range while staying a small PNG.
const mapImageScale = 2

// handleMapImage serves GET /api/mapimg?id=<mapID>: a PNG of the map's
// terrain, rendered once and cached (terrain is static at runtime). The map
// window and minimap draw this image instead of rasterizing every tile.
func (p *Proxy) handleMapImage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing map id", http.StatusBadRequest)
		return
	}

	p.mapimgMu.Lock()
	if png := p.mapimgCache[id]; png != nil {
		p.mapimgMu.Unlock()
		writeMapPNG(w, png)
		return
	}
	p.mapimgMu.Unlock()

	var ow *protocol.OverworldMap
	for _, m := range p.atlasMaps() {
		if m.ID == id {
			m := m
			ow = &m.Overworld
			break
		}
	}
	if ow == nil {
		http.Error(w, "unknown map", http.StatusNotFound)
		return
	}
	pngBytes, err := game.RenderMapPNG(ow.Cols, ow.Rows, ow.Cells, mapImageScale)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	p.mapimgMu.Lock()
	if p.mapimgCache == nil {
		p.mapimgCache = map[string][]byte{}
	}
	p.mapimgCache[id] = pngBytes
	p.mapimgMu.Unlock()
	writeMapPNG(w, pngBytes)
}

func writeMapPNG(w http.ResponseWriter, pngBytes []byte) {
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = w.Write(pngBytes)
}
