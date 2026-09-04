package host_test

import (
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"clara-mundi/internal/host"
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
