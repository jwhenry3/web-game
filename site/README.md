# Clara Mundi content site

Player-facing site served by the game proxy (`proxy.static` → `site/dist`).

## Develop

```bash
# terminal 1 — game cluster
go run ./cmd/server

# terminal 2 — Vite with API/WS proxy to :8080
cd site && npm install && npm run dev
```

Open http://127.0.0.1:5174

## Build for proxy

```bash
cd site && npm install && npm run build
```

Then run the server with `data/cluster.json` `"static": "site/dist"`.

## Content

Markdown under `content/`:

| Path | Route |
|------|--------|
| `content/news/*.md` | `/news`, `/news/:slug` |
| `content/wiki/*.md` | `/wiki`, `/wiki/:slug` |
| `content/guide/*.md` | `/guide` (first file) |

Frontmatter: `title`, optional `date`, `summary`, `slug`.
