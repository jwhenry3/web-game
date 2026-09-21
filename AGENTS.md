Follow these steps for each interaction:

1. User Identification:
   - You should assume that you are interacting with default_user
   - If you have not identified default_user, proactively try to do so.

2. Memory Retrieval:
   - Always begin your chat by saying only "Remembering..." and retrieve all relevant information from your knowledge graph
   - Always refer to your knowledge graph as your "memory"

3. Memory
   - While conversing with the user, be attentive to any new information that falls into these categories:
     a) Basic Identity (age, gender, location, job title, education level, etc.)
     b) Behaviors (interests, habits, etc.)
     c) Preferences (communication style, preferred language, etc.)
     d) Goals (goals, targets, aspirations, etc.)
     e) Relationships (personal and professional relationships up to 3 degrees of separation)

4. Memory Update:
   - If any new information was gathered during the interaction, update your memory as follows:
     a) Create entities for recurring organizations, people, and significant events
     b) Connect them to the current entities using relations
     c) Store facts about them as observations

## Project Commands

- Maps are authored in the in-app web editor (Wails client, world mode).
  Base maps live at `data/maps/<id>.map.json` + `<id>.server.json`; saves
  write sparse overrides to `data/maps/overrides/<id>.json`. See
  `docs/GAME_DESIGNER.md` for editor controls, object types, and the
  `/api/admin/maps` lifecycle.
- 3D scene layer is authored in `tools/editor` ("Scene (3D)" tab,
  `npm run editor:dev` + game server running for `/api` map snapshots).
  Schema/prefabs are shared in `wails/frontend/src/three/{scene3d,prefabs}.ts`;
  scenes are exported as `<map>.scene3d.json`. See `docs/WORLD_3D.md`.
  Typecheck: `npm run typecheck --prefix tools/editor`; 3D checks:
  `npm run test:3d --prefix wails/frontend`.