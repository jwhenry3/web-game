package proxy

import (
	"image/png"
	"net/http"
	"net/http/httptest"
	"testing"

	"clara-mundi/internal/cluster"
)

func TestMapImageRendersAndCaches(t *testing.T) {
	n, profiles, accounts := newTestNode(t)
	p := New(cluster.Config{
		World: &cluster.WorldSpec{ID: n.Spec.ID, Name: n.Spec.Name, Config: n.Spec.Config},
	}, "", nil, accounts, profiles, "")
	p.RegisterWorld(n)

	get := func(path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		p.handleMapImage(rec, httptest.NewRequest(http.MethodGet, path, nil))
		return rec
	}

	rec := get("/api/mapimg?id=" + n.Spec.ID)
	if rec.Code != http.StatusOK {
		t.Fatalf("mapimg status %d: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Fatalf("content type = %q", ct)
	}
	img, err := png.Decode(rec.Body)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	// Blank test map is 16×16 tiles → 32×32 px at mapImageScale=2.
	if b := img.Bounds(); b.Dx() != 16*mapImageScale || b.Dy() != 16*mapImageScale {
		t.Fatalf("image bounds = %v", b)
	}

	// Second request must hit the cache (single entry, same bytes served).
	rec2 := get("/api/mapimg?id=" + n.Spec.ID)
	if rec2.Code != http.StatusOK {
		t.Fatalf("second mapimg status %d", rec2.Code)
	}
	p.mapimgMu.Lock()
	cached := len(p.mapimgCache)
	p.mapimgMu.Unlock()
	if cached != 1 {
		t.Fatalf("cache entries = %d, want 1", cached)
	}

	if rec := get("/api/mapimg?id=nope"); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown map status = %d", rec.Code)
	}
	if rec := get("/api/mapimg"); rec.Code != http.StatusBadRequest {
		t.Fatalf("missing id status = %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	p.handleMapImage(rec, httptest.NewRequest(http.MethodPost, "/api/mapimg?id=x", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d", rec.Code)
	}
}
