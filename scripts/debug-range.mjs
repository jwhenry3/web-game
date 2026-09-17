// Debug: reproduce "target out of range" in overworld combat.
// Registers a guest account, joins, walks into an NPC's aggro radius, then
// probes attack/spell ranges.
// Usage: node scripts/debug-range.mjs   (server must be running on :8080)

import { findPath } from "./lib/path.mjs";

const API = "http://localhost:8080/api";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const user = "probe" + Date.now().toString(36);
const reg = await fetch(`${API}/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: user, password: "probe-pass-123" }),
}).then((r) => r.json());
const token = reg.token;
if (!token) { console.error("register failed:", reg); process.exit(1); }
console.log("registered", user);

const ws = new WebSocket(`ws://localhost:8080/ws?token=${encodeURIComponent(token)}`);
const p = {
  id: null, profile: null, worldPlayers: {}, npcs: {}, map: null,
  combat: new Map(), events: [],
  send: (t, pl) => ws.send(JSON.stringify({ type: t, payload: pl })),
  waiters: [],
};

ws.addEventListener("open", () =>
  p.send("join_world", { player_name: "Probe" + user.slice(-4), race: "humanus", main_job: "HEX" }));
ws.addEventListener("message", (evt) => {
  const env = JSON.parse(evt.data);
  const pl = env.payload;
  switch (env.type) {
    case "welcome": p.id = pl.player_id; p.profile = pl.profile; break;
    case "world_state":
      for (const e of pl.entities ?? []) {
        if (e.kind === "player") p.worldPlayers[e.id] = e;
        else if (e.kind === "npc") p.npcs[e.id] = e;
      }
      if (pl.map?.cells) p.map = pl.map;
      break;
    case "player_joined": case "player_sync": p.worldPlayers[pl.id] = pl; break;
    case "player_moved": if (p.worldPlayers[pl.id]) Object.assign(p.worldPlayers[pl.id], { x: pl.x, y: pl.y }); break;
    case "entity_state": for (const e of pl.entities ?? []) { if (e.kind === "npc") p.npcs[e.id] = e; } break;
    case "combat_tick":
      p.combat.clear();
      for (const e of pl.entities ?? []) p.combat.set(e.id, e);
      break;
    case "combat_event":
      p.events.push(pl);
      if (pl.message) console.log(`  EVENT: ${pl.message}  (action=${pl.action_id})`);
      p.combat.clear();
      for (const e of pl.entities ?? []) p.combat.set(e.id, e);
      break;
    case "reward_notice": console.log("  REWARD:", pl.message); break;
    case "error": console.log("  SERVER ERROR:", pl.message); break;
  }
  for (const w of [...p.waiters]) {
    if (w.pred(p, env)) { p.waiters.splice(p.waiters.indexOf(w), 1); w.resolve(env); }
  }
});
p.until = (pred, label) => new Promise((res, rej) => {
  if (pred(p, { type: "__poll" })) return res(null);
  const t = setTimeout(() => rej(new Error("timeout: " + label)), 30_000);
  p.waiters.push({ pred, resolve: (v) => { clearTimeout(t); res(v); } });
});

const self = () => p.worldPlayers[p.id];
const foes = () => [...p.combat.values()].filter((e) => !e.is_player && !e.is_ally && e.alive);
const npcById = (id) => p.combat.get(id) ?? p.npcs[id];
const distTo = (e) => Math.hypot(self().x - e.x, self().y - e.y).toFixed(1);

async function moveStep(x, y) {
  p.send("move", { x, y });
  await sleep(80);
}

// A*-guided approach: repaths each pass so a moving target and walls both
// work; falls back to a direct step when no path resolves.
async function approach(e, gap) {
  let path = null;
  for (let i = 0; i < 120; i++) {
    const s = self(); if (!s) return;
    const t = npcById(e.id) ?? e;
    const dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy);
    if (d <= gap) return;
    if (!path || !path.length) {
      path = findPath(p.map, s.x, s.y, t.x, t.y) ?? [];
    }
    const wp = path.length ? path[0] : t;
    const wd = Math.hypot(wp.x - s.x, wp.y - s.y) || 1;
    if (path.length && wd <= 8) { path.shift(); continue; }
    const step = Math.min(30, Math.min(wd, d - gap));
    await moveStep(s.x + ((wp.x - s.x) / wd) * step, s.y + ((wp.y - s.y) / wd) * step);
    const t2 = npcById(e.id) ?? e;
    const ts = p.map?.tile ?? 32;
    if (path.length &&
      (Math.floor(t2.x / ts) !== Math.floor(t.x / ts) || Math.floor(t2.y / ts) !== Math.floor(t.y / ts))) {
      path = null;
    }
  }
}

async function attack(actionId, targetId, tag) {
  const e = npcById(targetId);
  console.log(`\n[${tag}] action=${actionId} target=${e?.name} dist=${e ? distTo(e) : "?"} selfPos=(${self().x.toFixed(0)},${self().y.toFixed(0)})`);
  p.send("action", { action_id: actionId, target_id: targetId });
  await sleep(2700); // GCD is 2.5s
}

async function main() {
  await p.until((pl) => pl.id !== null, "welcome");
  console.log("joined:", p.id, "job:", p.profile.main_job);
  console.log("unlocked:", p.profile.skills.filter(s => s.unlocked).map(s => s.id).join(","));

  await p.until((pl) => Object.values(pl.npcs).length > 0, "npcs");
  // Walk into the first NPC's aggro radius (~110px), routing around walls.
  {
    const npc = Object.values(p.npcs)[0];
    let path = null;
    for (let i = 0; i < 200 && !self()?.engaged; i++) {
      const cur = p.npcs[npc?.id] ?? Object.values(p.npcs)[0];
      const s = self();
      if (!cur || !s) break;
      const d = Math.hypot(cur.x - s.x, cur.y - s.y) || 1;
      if (d <= 24) break;
      if (!path || !path.length) {
        path = findPath(p.map, s.x, s.y, cur.x, cur.y) ?? [];
        if (!path.length) break;
      }
      const wp = path[0];
      const wd = Math.hypot(wp.x - s.x, wp.y - s.y);
      if (wd <= 8) { path.shift(); continue; }
      const step = Math.min(72, wd);
      p.send("move", { x: Math.round(s.x + ((wp.x - s.x) / wd) * step), y: Math.round(s.y + ((wp.y - s.y) / wd) * step) });
      await sleep(280);
    }
  }
  await p.until((pl) => pl.worldPlayers[pl.id]?.engaged === true, "combat engaged");
  console.log("\nengaged. combat entities:");
  for (const e of p.combat.values()) console.log(`  ${e.id} ${e.name} @(${e.x.toFixed(0)},${e.y.toFixed(0)}) player=${e.is_player}`);

  const foe = foes()[0];
  if (!foe) { console.error("no foe in combat snapshot"); process.exit(1); }

  // 1) attack at spawn distance — expect legit out of range
  await attack("attack", foe.id, "spawn distance");

  // 2) walk to ~50px and attack — expect hit
  await approach(foe, 50);
  await sleep(400);
  await attack("attack", foe.id, "adjacent, facing");

  // 3) strafe sideways ~40px then attack — facing must not matter
  const s = self();
  await moveStep(s.x, s.y + 40);
  await sleep(400);
  await attack("attack", foe.id, "adjacent, sideways facing");

  const foe2 = foes()[0];
  if (foe2) {
    // 4) ranged spell adjacent — should hit
    await approach(npcById(foe2.id) ?? foe2, 60);
    await sleep(400);
    await attack("hex_ignis_hex", foe2.id, "spell adjacent (should hit)");

    // 5) back off to ~330px — beyond 320, legit fail
    for (let i = 0; i < 20; i++) {
      const s2 = self(); const f = npcById(foe2.id);
      if (!s2 || !f) break;
      if (Math.hypot(f.x - s2.x, f.y - s2.y) >= 330) break;
      const dx = s2.x - f.x, dy = s2.y - f.y, m = Math.hypot(dx, dy) || 1;
      await moveStep(s2.x + (dx / m) * 25, s2.y + (dy / m) * 25);
    }
    await sleep(400);
    await attack("hex_ignis_hex", foe2.id, "spell ~330 (should fail)");

    // 6) mid range ~200 — should hit
    await approach(npcById(foe2.id) ?? foe2, 200);
    await sleep(400);
    await attack("hex_ignis_hex", foe2.id, "spell ~200 (should hit)");
  }

  await sleep(500);
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
setTimeout(() => { console.error("timed out"); process.exit(1); }, 120_000);
