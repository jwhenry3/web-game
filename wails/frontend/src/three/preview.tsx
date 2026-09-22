import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThreeGame } from "./ThreeGame";
import { useGame, applyCombatEvent } from "../state/store";
import { setGameTransport } from "../net/transport";
import { applyMapSnapshotToGame, fetchMapConfig, fetchMapList } from "../net/mapConfig";
import { fetchAtlas } from "../net/atlas";
import { circleWalkableAt } from "../world/overworld";
import type { HouseStatePayload, MapSnapshot, WorldEntity } from "../types";
import "../styles.css";
import "./preview.css";

// An explicit local exploration mode: reads real server map snapshots, but
// never joins a multiplayer session or writes player data to the server.
setGameTransport({
  connect: () => {}, disconnect: () => {}, isOpen: () => true,
  send(type, payload) {
    if (type !== "move") return;
    const position = payload as { x: number; y: number; facing?: number };
    useGame.setState(s => ({
      entities: { ...s.entities, explorer: { ...s.entities.explorer, ...position } },
      // Mirror the house hub echoing the player's authoritative position —
      // like the real server, follow-up broadcasts omit the map snapshot.
      house: s.house ? { ...s.house, map: undefined, players: s.house.players.map(p => p.id === s.selfId ? { ...p, ...position } : p) } : s.house,
    }));
  },
});

function spawn(map: MapSnapshot, biome = "H") {
  const { overworld: world } = map;
  // Prefer the first settlement; keep away from impassable edges.
  let index = world.cells.indexOf(biome), best = -1, bestDistance = Infinity;
  while (index >= 0) {
    const c = index % world.cols, r = Math.floor(index / world.cols);
    const distance = (c - world.cols * .45) ** 2 + (r - world.rows * .45) ** 2;
    if (distance < bestDistance && [-1, 0, 1].every(dy => [-1, 0, 1].every(dx => world.cells[(r + dy) * world.cols + c + dx] === biome))) {
      best = index; bestDistance = distance;
    }
    index = world.cells.indexOf(biome, index + 1);
  }
  index = best >= 0 ? best : world.cells.indexOf(biome);
  while (index >= 0) {
    const x = (index % world.cols + .5) * world.tile, y = (Math.floor(index / world.cols) + .5) * world.tile;
    if (circleWalkableAt(world, x, y)) {
      const explorer: WorldEntity = { id: "explorer", name: "Explorer", kind: "player", x, y, z: 0, grounded: true, hp: 100, max_hp: 100, alive: true, main_job: "VAN" };
      useGame.setState({ screen: "world", connected: true, selfId: explorer.id, entities: { explorer }, combatEvents: [], jobChangers: {}, camps: {} });
      return;
    }
    index = world.cells.indexOf(biome, index + 1);
  }
  throw new Error("No walkable starting point for this biome.");
}

function Preview() {
  const explorer = useGame(s => s.entities.explorer);
  const [maps, setMaps] = useState<MapSnapshot[]>([]);
  const [map, setMap] = useState<MapSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState("Settlement");
  const [ready, setReady] = useState(false);
  async function load(id: string) {
    setLoading(true); setError(""); setReady(false);
    try {
      const [snapshot, atlas] = await Promise.all([fetchMapConfig(id), fetchAtlas()]);
      applyMapSnapshotToGame(snapshot); spawn(snapshot);
      const points = atlas.maps.find(m => m.id === id)?.pois.filter(p => p.kind === "save_point") ?? [];
      useGame.setState({ savePoints: Object.fromEntries(points.map(p => [p.id, p])) });
      setMap(snapshot); setReady(true); setLocation("Settlement");
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void fetchMapList().then(list => { setMaps(list); if (!list.length) throw new Error("The server has no maps enabled."); return load(list.find(m => m.id === "clara_mundi")?.id ?? list[0].id); }).catch(e => { setError(String(e)); setLoading(false); });
  }, []);
  const visit = (biome: string, name: string) => {
    if (!map) return;
    try { spawn(map, biome); setLocation(name); setError(""); }
    catch (e) { setError(String(e)); }
  };
  // Camp preview: fabricate a house session around the walkable island so the
  // 3D camp renderer can be exercised without a multiplayer house. The map +
  // scene3d mirror internal/game.NewHouseOverworld + NewHouseScene3D.
  const camp = () => {
    const t = 32, oc = 40, or_ = 40, cols = 20, rows = 20;
    const cx = (oc + cols / 2) * t, cy = (or_ + rows / 2) * t;
    const explorer = useGame.getState().entities.explorer ?? { id: "explorer", name: "Explorer", kind: "player", x: cx, y: cy, z: 0, grounded: true, hp: 100, max_hp: 100, alive: true, main_job: "VAN" } as WorldEntity;
    const guest: WorldEntity = { ...explorer, id: "guest", name: "Guest" };
    const furniture = [
      { id: "f1", col: oc + 4, row: or_ + 5, item: { id: "i1", name: "Oak Table", kind: "furniture", rarity: "common" as const, level: 1 } },
      { id: "f2", col: oc + 14, row: or_ + 6, item: { id: "i2", name: "Camp Cot", kind: "furniture", rarity: "common" as const, level: 1 } },
      { id: "f3", col: oc + 15, row: or_ + 12, item: { id: "i3", name: "Brazier", kind: "furniture", rarity: "common" as const, level: 1 } },
    ];
    // Same island-in-rock layout the server builds.
    const cells: string[] = [];
    for (let r = 0; r < 100; r++) {
      let row = "";
      for (let c = 0; c < 100; c++) row += c >= oc && c < oc + cols && r >= or_ && r < or_ + rows ? "." : "#";
      cells.push(row);
    }
    const poi = (id: string, name: string, kind: string, c: number, r: number) => ({
      id, name, prefab: kind, visible: true, props: {},
      transform: { position: [(c + .5) * 2, 0, (r + .5) * 2], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: { poi: { enabled: true, type: kind, label: name, interactionRadius: 5, destinationMap: "" } },
    });
    const doorC = oc + cols / 2, doorR = or_ + rows - 2;
    const house: HouseStatePayload = {
      owner_name: "Explorer", skin: "basic",
      map_cols: 100, map_rows: 100, walk_cols: cols, walk_rows: rows,
      walk_origin_col: oc, walk_origin_row: or_, tile_size: t,
      map: {
        id: "house", name: "Explorer's camp",
        overworld: { tile: t, cols: 100, rows: 100, cells: cells.join("") },
        origin_x: 0, origin_y: 0,
        scene3d: {
          version: 1, map: "house",
          environment: {}, prefabs: [], terrain: { version: 1, heights: {}, cells: {} },
          objects: [
            poi("house-door", "Door", "door", doorC, doorR),
            poi("house-storage", "Storage", "storage", doorC - 2, doorR),
            ...furniture.map((f) => ({
              id: `furniture:${f.id}`, name: f.item.name, prefab: "furniture", visible: true, props: { itemId: f.item.id },
              transform: { position: [(f.col + .5) * 2, 0, (f.row + .5) * 2], rotation: [0, 0, 0], scale: [1, 1, 1] },
              components: { collider: { enabled: true, shape: "box" as const, size: [1.5, 2, 1.5], offset: [0, 1, 0], isTrigger: false } },
            })),
          ],
        },
      },
      players: [
        { id: "explorer", name: "Explorer", x: cx, y: cy + 3 * t, facing: 0, z: 0, grounded: true, owner: true, pets: [{ id: "pet1", name: "Dire Wolf", sprite: "dire_wolf", x: cx - 2 * t, y: cy + 2 * t, facing: 0, z: 0, grounded: true }] },
        { id: "guest", name: "Guest", x: cx + 3 * t, y: cy - t, facing: Math.PI / 2, z: 0, grounded: true },
      ],
      furniture,
      pois: [
        { id: "door", kind: "door", name: "Exit", x: (doorC + .5) * t, y: (doorR + .5) * t },
        { id: "storage", kind: "storage", name: "Storage", x: (doorC - 1.5) * t, y: (doorR + .5) * t },
      ],
      is_owner: true,
    };
    useGame.setState({
      screen: "house", connected: true, selfId: "explorer",
      entities: { explorer, guest }, house, combatEvents: [],
    });
    setLocation("Explorer's camp");
  };
  const effect = () => {
    const self = useGame.getState().entities.explorer;
    if (self) applyCombatEvent({ attacker_id: self.id, target_id: self.id, damage: 0, heal: 20, hit: true, action_id: "heal", entities: [] });
  };
  return <div className="game-stage world-preview">
    {ready && <ThreeGame />}
    <header className="preview-heading"><div className="preview-eyebrow">CLARA MUNDI <span>WORLD EXPLORER</span></div><h1>A world with depth.</h1><p>{location} <span> / </span> {map?.name ?? "Connecting to the world"}</p></header>
    <aside className="preview-panel"><div className="preview-eyebrow">EXPLORE THE TERRAIN</div><p>Travel across the existing world, from quiet settlements to frozen highlands.</p><label>World<select aria-label="World" value={map?.id ?? ""} disabled={loading} onChange={e => void load(e.target.value)}>{maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><nav aria-label="Visit biome">{[["H", "Settlement"], [".", "Meadow"], ["T", "Woodland"], ["D", "Coast & dunes"], ["S", "Snowfields"], ["I", "Frozen shore"]].map(([biome, name]) => <button disabled={!ready} className={location === name ? "active" : ""} key={biome} onClick={() => visit(biome, name)}>{name}<span>↗</span></button>)}</nav><button className="preview-effect" disabled={!ready} onClick={effect}>✦ Cast a healing burst</button><button className="preview-effect" disabled={!ready} onClick={camp}>⚑ Visit camp (3D)</button><small>Local exploration · multiplayer progress is not saved</small></aside>
    <footer className="preview-footer"><span><b>WASD</b> Move</span><span><b>CLICK</b> Walk</span><span><b>RIGHT DRAG</b> Orbit</span><span><b>SCROLL</b> Zoom</span><span><b>SHIFT</b> Dodge</span><output aria-label="Player coordinates">{explorer ? `${Math.round(explorer.x)}, ${Math.round(explorer.y)}` : "—"}</output></footer>
    {loading && <div className="preview-loading">Loading world geometry…</div>}
    {error && <div className="three-error" role="alert"><strong>Could not open the world</strong><p>{error}</p><p>Start the game server with <code>go run ./cmd/server</code>, then reload.</p><button onClick={() => window.location.reload()}>Reload</button></div>}
  </div>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<React.StrictMode><Preview /></React.StrictMode>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
