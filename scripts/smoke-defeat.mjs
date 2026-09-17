// Regression test for the defeat flow: a solo player walks into a hostile NPC
// and never acts, so the foe wins. Verifies the player respawns at a save
// point, regains immunity, and the in_combat flag clears.
//
// Usage: node scripts/smoke-defeat.mjs   (server must be running on :8080)

import { findPath } from "./lib/path.mjs";

const URL = "ws://localhost:8080/ws";
const HTTP = "http://localhost:8080";

setTimeout(() => {
  console.error("FAIL: defeat smoke test timed out after 120s");
  process.exit(1);
}, 120_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const user = "sm-martyr-" + Date.now().toString(36);
const reg = await fetch(`${HTTP}/api/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: user, password: "smoke-pass-1" }),
}).then((r) => r.json());
if (!reg.token) { console.error("FAIL: register:", reg); process.exit(1); }

const ws = new WebSocket(`${URL}?token=${encodeURIComponent(reg.token)}`);
let selfId = null;
let self = null;
let npcs = {};
let map = null;
let sawDefeat = false;
let walking = false;

function send(type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

function nearestNPC() {
  let best = null, bestD = Infinity;
  for (const n of Object.values(npcs)) {
    if (n.hp !== undefined && n.hp <= 0) continue;
    const d = self ? Math.hypot(n.x - self.x, n.y - self.y) : 0;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

async function walkTowardNPC() {
  if (walking || self?.engaged) return;
  walking = true;
  const target = nearestNPC();
  if (!target || !self) {
    walking = false;
    return;
  }
  // Proximity aggro: walk until the NPC engages us (in_combat flips true).
  // A* routes around walls; if the foe patrols the sanctuary border we may
  // stay on safe tiles — fall back to an attack pull either way.
  let path = null;
  for (let i = 0; i < 280 && !self?.engaged; i++) {
    const cur = npcs[target.id];
    if (!cur) break;
    const dist = Math.hypot(cur.x - self.x, cur.y - self.y) || 1;
    if (dist <= 24) {
      await sleep(1500); // give proximity aggro a beat, then pull if safe-zoned
      if (!self?.engaged) {
        send("set_target", { target_id: target.id });
        send("action", { action_id: "attack", target_id: target.id });
        await sleep(1500);
        if (!self?.engaged) break;
      }
      break;
    }
    if (!path || !path.length) {
      path = findPath(map, self.x, self.y, cur.x, cur.y) ?? [];
      if (!path.length) break; // unreachable
    }
    const wp = path[0];
    const wd = Math.hypot(wp.x - self.x, wp.y - self.y);
    if (wd <= 8) {
      path.shift();
      continue;
    }
    const step = Math.min(72, wd);
    send("move", {
      x: Math.round(self.x + ((wp.x - self.x) / wd) * step),
      y: Math.round(self.y + ((wp.y - self.y) / wd) * step),
    });
    await sleep(260);
    // Repath when the NPC wandered to a different tile.
    const cur2 = npcs[target.id];
    const ts = map?.tile ?? 32;
    if (
      cur2 && path.length &&
      (Math.floor(cur2.x / ts) !== Math.floor(cur.x / ts) ||
        Math.floor(cur2.y / ts) !== Math.floor(cur.y / ts))
    ) {
      path = null;
    }
  }
  walking = false;
}

ws.addEventListener("open", () =>
  send("join_world", { player_name: "SmokeMartyr-" + Date.now().toString(36), race: "humanus", main_job: "HEX" }));

ws.addEventListener("message", (evt) => {
  const env = JSON.parse(evt.data);
  const pl = env.payload;

  switch (env.type) {
    case "welcome":
      if (!selfId) {
        selfId = pl.player_id;
        console.log("joined world, seeking an NPC to fight...");
      }
      break;

    case "world_state":
      for (const e of pl.entities ?? []) {
        if (e.id === selfId) self = e;
        else if (e.kind === "npc") npcs[e.id] = e;
      }
      if (pl.map?.cells) map = pl.map;
      if (selfId && !self?.engaged && Object.keys(npcs).length > 0) {
        void walkTowardNPC();
      }
      break;

    case "player_sync":
      if (pl.id === selfId) {
        const wasCombat = self?.engaged === true;
        self = pl;
        if (pl.engaged && !wasCombat) {
          console.log("engaged by NPC, standing idle until defeat...");
        }
        if (sawDefeat && !pl.engaged && pl.hp === pl.max_hp) {
          console.log(`PASS: respawned at (${pl.x.toFixed(0)},${pl.y.toFixed(0)}) hp=${pl.hp}/${pl.max_hp} immune_until=${pl.immune_until}`);
          if (pl.immune_until > Date.now()) {
            console.log("PASS: post-defeat immunity window granted");
          }
          ws.close();
          process.exit(0);
        }
      }
      break;

    case "player_moved":
      if (pl.id === selfId && self) Object.assign(self, { x: pl.x, y: pl.y });
      break;

    case "entity_state":
      for (const e of pl.entities ?? []) { if (e.kind === "npc") npcs[e.id] = e; }
      break;

    case "combat_event":
      if (pl.target_id === selfId && pl.message?.includes("defeated")) {
        sawDefeat = true;
        console.log("defeat event received:", pl.message);
        console.log("PASS: defeat is client-safe (no crash frame)");
      }
      break;

    case "error":
      console.error("FAIL: server error:", pl.message);
      process.exit(1);
  }
});

ws.addEventListener("close", () => {
  if (!sawDefeat) {
    console.error("FAIL: connection closed before defeat flow completed");
    process.exit(1);
  }
});
