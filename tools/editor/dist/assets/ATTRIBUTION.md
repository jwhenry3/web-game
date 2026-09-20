# Game assets attribution

## AU_pixel — HEROES 99 Character Pack (v1.2)

- **Pack:** [HEROES 99 - Fully Animated Customizable RPG Character Pack](https://au-pixel.itch.io/heroes99)
- **Author:** AU_pixel (Clockwork Raven Studios)
- **License:** Purchased for use in this project
- **Location:** `wails/frontend/public/assets/heroes99/`
- **Usage:** Layered player sprites (skin, face, hair, cloth, weapon) composed at runtime in world and battle scenes

Layer stack: skin → cloth (bot/top) → hair (bot/top) → face → weapon (bot/top).

## Enemy sprites — generated in-repo

- **Location:** `wails/frontend/public/assets/enemies/` (`<kind>.png` sheets, `<kind>_icon.png` previews)
- **Usage:** Overworld/battle enemy sprites in the Heroes 99 frame layout (100×40 cells, same anims)
- **Regenerate:** `npm run sprites:enemies` (`scripts/gen-enemy-sprites.mjs` — hand-authored pixel painter + PNG encoder, no deps)
- The legacy `*.svg` sources in the same folder are unused and kept only as reference.

## Clockwork Raven Studios — Raven Fantasy Icons

- **Pack:** Raven Fantasy Icons (Free)
- **Author:** Clockwork Raven Studios (Caio)
- **Location:** `wails/frontend/public/assets/raven-fantasy-icons/icons/`
- **Usage:** Curated UI icons loaded by the client

The game uses a subset of icons from the user-provided free Raven Fantasy Icons pack.
