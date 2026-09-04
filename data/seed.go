// Package data embeds stock game files shipped with the binary.
// Accounts and profiles are intentionally NOT embedded — they stay on disk only.
package data

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// FS holds cluster config, map assets, and content catalogs from the repo data/ tree.
//
//go:embed cluster.json
//go:embed maps
//go:embed content
var FS embed.FS

// Materialize copies each embedded seed file into root/data/... when the destination
// does not already exist. Existing files are left untouched so player edits persist.
func Materialize(root string) error {
	root = filepath.Clean(root)
	dataRoot := filepath.Join(root, "data")
	if err := os.MkdirAll(dataRoot, 0o755); err != nil {
		return err
	}

	var created int
	err := fs.WalkDir(FS, ".", func(name string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if name == "." {
			return nil
		}
		// Never write player saves from the embed set (none should be present).
		base := filepath.Base(name)
		if base == "accounts.json" || base == "profiles.json" || base == "cluster.maps.json" {
			return nil
		}
		if strings.HasPrefix(name, "standalone/") || name == "standalone" {
			return nil
		}

		dest := filepath.Join(dataRoot, filepath.FromSlash(name))
		if d.IsDir() {
			return os.MkdirAll(dest, 0o755)
		}
		if _, err := os.Stat(dest); err == nil {
			return nil // keep local copy
		} else if !os.IsNotExist(err) {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return err
		}
		in, err := FS.Open(name)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o644)
		if err != nil {
			if os.IsExist(err) {
				return nil
			}
			return err
		}
		defer out.Close()
		if _, err := io.Copy(out, in); err != nil {
			return err
		}
		created++
		return nil
	})
	if err != nil {
		return fmt.Errorf("materialize game data: %w", err)
	}
	if created > 0 {
		log.Printf("seed: wrote %d missing file(s) under %s", created, dataRoot)
	}
	return nil
}
