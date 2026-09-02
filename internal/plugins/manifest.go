package plugins

// ClientManifest is returned by GET /api/modules.
type ClientManifest struct {
	Version int            `json:"version"`
	Combat  string         `json:"combat"`
	Modules []ClientModule `json:"modules"`
}

type ClientModule struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Version      string         `json:"version"`
	Capabilities []string       `json:"capabilities"`
	Frontend     FrontendConfig `json:"frontend"`
	Config       map[string]any `json:"config"`
}
