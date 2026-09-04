# Fantasy Wails Desktop Client

Go-native game core + React UI + Phaser renderer. Shares `internal/game`,
`internal/protocol`, `internal/clientnet`, and `internal/host` with `cmd/server`.

## Layout (shared libraries)

```text
internal/
  game/        shared rules (collision, jobs, loot, maps) — server + client
  protocol/    wire envelopes — server + client
  clientnet/   Go client WS + movement prediction — desktop client
  host/        cluster bootstrap (proxy + maps) — cmd/server + standalone Wails
  proxy/ …     server-only networking
wails/
  app/         Wails bindings (thin glue over clientnet + optional host)
  frontend/    Vite + React + Phaser UI (sole client)
cmd/server/    dedicated multiplayer server entry
```

## Modes

| Mode | Command | Server |
|------|---------|--------|
| Client-only | `npm run wails:dev` | External `npm run server:dev` on :8080 |
| Standalone (env) | `npm run wails:dev:standalone` | In-process on ephemeral `127.0.0.1:port` |
| Standalone binary | `npm run wails:build:standalone` | Writes `bin/fantasy-standalone.exe` (`-tags standalone`) |

Standalone keeps **accounts** and **profiles** as external JSON on disk (never
`go:embed`’d into the binary). Stock maps/content are embedded and written
under `data/` next to the exe when missing:

| Mode | Player saves | Stock world data |
|------|--------------|------------------|
| Production standalone exe | `<exeDir>/data/accounts.json` (+ profiles) | `<exeDir>/data/{cluster,maps,content}` (seeded if absent) |
| Dev (`FANTASY_STANDALONE=1`) | `data/standalone/…` under the repo | Repo `data/` (already present) |
| Override | `FANTASY_DATA_DIR` → accounts/profiles only | Still install-root `data/` |

Files are created on first save. Default **admin / admin** is created at runtime in
that JSON file if missing — it is not baked into the executable.

Run **`bin/fantasy-standalone.exe`** for offline play. `fantasy-client.exe` is
client-only and expects an external server on `:8080`.

## Prerequisites

- Go 1.25+
- Wails CLI v2 (`go install github.com/wailsapp/wails/v2/cmd/wails@v2.10.2`)
- Ensure `%GOPATH%\bin` (or `$GOPATH/bin`) is on your PATH
- Node.js 20+
- For client-only: game server running (`npm run server:dev`)
- Run from the **repo root** (or a cwd under it) so `data/` resolves

## Commands (repo root)

```bash
npm run wails:install
npm run wails:dev                 # needs external server
npm run wails:dev:standalone      # all-in-one for testing
npm run wails:build
npm run wails:build:standalone
```

Env overrides:

| Variable | Effect |
|----------|--------|
| `FANTASY_SERVER_URL` | Client-only: base URL (default `http://127.0.0.1:8080`) |
| `FANTASY_STANDALONE=1` | Embed server even without `-tags standalone` |
| `FANTASY_DATA_DIR` | Directory for external `accounts.json` / `profiles.json` |
| `JWT_SECRET` | Shared with embedded host when set |

## What Go owns

| Concern | Package |
|---------|---------|
| Cluster start / stop | `internal/host` |
| WebSocket client (protobuf) | `internal/clientnet` |
| Wire contract | `proto/fantasy/v1` → `internal/protocol` |
| Movement prediction | `internal/clientnet` → `internal/game` |
| Wails bindings | `wails/app` |
| Dedicated server | `cmd/server` → `internal/host` |

Desktop clients negotiate **protobuf** (`?codec=protobuf`). See [docs/PROTOCOL.md](../docs/PROTOCOL.md).

## Thin Phaser movement

`WorldScene` calls `applyPlayerSlide()` which uses Go `StepMove` when the Wails
movement bridge is set; otherwise it falls back to `src/world/overworld.ts`.
