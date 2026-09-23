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
- 3D scene layer is authored in `tools/editor` (3D-only: top-level
  World/Content tabs — World is the scene editor with the terrain selectable
  via its Hierarchy row, `npm run editor:dev` + game
  server running for `/api` map snapshots).
  Schema/prefabs are shared in `wails/frontend/src/three/{scene3d,prefabs}.ts`;
  scenes save as `<map>.scene3d.json`. The schema-driven MMORPG CMS lives in
  `wails/frontend/src/content` and persists through `/api/admin/content/gameplay`.
  See `docs/WORLD_3D.md`.
  Recursive content-editor work starts at
  `docs/recursive-content/README.md`; follow its staged documents and file
  ownership rules before modifying Content, Characters, Effects, or Prefabs.
  Typecheck: `npm run typecheck --prefix tools/editor`; 3D checks:
  `npm run test:3d --prefix wails/frontend`.

## Concurrent agent coordination

Multiple agents (and the user) edit this checkout. Follow this protocol so
nobody's work is clobbered:

1. **Claim before editing.** Run
   `node scripts/locks.mjs claim <files> --agent=<your-name> --task="<short>"`
   before modifying files. If a file is `LOCKED` by another agent, do NOT
   edit it — pick different files, or ask the user to coordinate.
   `node scripts/locks.mjs list` shows every active claim.
2. **Release when done.**
   `node scripts/locks.mjs release <files>` or `--all` frees your claims.
   Locks go stale after 24h and may be `--force`-stolen only with the user's
   say-so.
3. **Re-read before every edit.** Never rely on a file read from earlier in
   the session — another agent may have changed it. Keep edits small and
   atomic so a conflict window stays short.
4. **Respect ownership.** `docs/recursive-content/` defines per-area file
   ownership (graph/schema, generic UI, specialist adapters). Stay inside
   your lane; `tools/editor/src/content/ContentWorkspace.tsx` is
   single-owner — never two agents at once.
5. **Parallel work: use a worktree.** For long-running parallel tasks,
   isolate instead of locking:
   `git worktree add ../web-game-<name> -b work/<name>` — each agent gets its
   own checkout sharing `.git`; conflicts become normal merge conflicts at
   integration time rather than save-time clobbers.
