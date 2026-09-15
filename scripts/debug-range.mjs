// Debug: reproduce "target out of range" in realtime combat.
// Registers a guest account, joins, walks into an NPC, then probes ranges.
// Usage: node scripts/debug-range.mjs   (server must be running on :8080)

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
  id: null, profile: null, worldPlayers: {}, npcs: {},
  rt: null, events: [],
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
      for (const w of pl.players ?? []) p.worldPlayers[w.id] = w;
      for (const n of pl.npcs ?? []) p.npcs[n.id] = n;
      break;
    case "player_joined": case "player_sync": p.worldPlayers[pl.id] = pl; break;
    case "player_moved": if (p.worldPlayers[pl.id]) Object.assign(p.worldPlayers[pl.id], { x: pl.x, y: pl.y }); break;
    case "npc_state": for (const n of pl.npcs ?? []) p.npcs[n.id] = n; break;
    case "profile": p.profile = pl; break;
    case "rt_battle_state": p.rt = { id: pl.battle_id, entities: new Map(pl.entities.map((e) => [e.id, e])) }; break;
    case "rt_battle_tick":
      if (p.rt) for (const u of pl.entities ?? []) { const e = p.rt.entities.get(u.id); if (e) Object.assign(e, u); }
      break;
    case "rt_battle_event":
      p.events.push(pl);
      if (pl.message) console.log(`  EVENT: ${pl.message}  (action=${pl.action_id})`);
      if (p.rt) for (const u of pl.entities ?? []) { const e = p.rt.entities.get(u.id); if (e) Object.assign(e, u); }
      break;
    case "rt_battle_end": console.log("  BATTLE END", pl.victory ? "victory" : "defeat"); break;
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

const self = () => p.rt?.entities.get(p.id);
const foes = () => [...p.rt.entities.values()].filter((e) => !e.is_player && !e.is_ally && e.alive);
const distTo = (e) => Math.hypot(self().x - e.x, self().y - e.y).toFixed(1);

async function moveStep(x, y) {
  p.send("rt_move", { x, y });
  await sleep(80);
}

async function approach(e, gap) {
  for (let i = 0; i < 60; i++) {
    const s = self(); if (!s) return;
    const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy);
    if (d <= gap) return;
    const step = Math.min(30, d - gap);
    await moveStep(s.x + (dx / d) * step, s.y + (dy / d) * step);
  }
}

async function attack(actionId, targetId, tag) {
  const e = p.rt.entities.get(targetId);
  console.log(`\n[${tag}] action=${actionId} target=${e?.name} dist=${e ? distTo(e) : "?"} selfPos=(${self().x.toFixed(0)},${self().y.toFixed(0)})`);
  p.send("action", { action_id: actionId, target_id: targetId });
  await sleep(350);
}

async function main() {
  await p.until((pl) => pl.id !== null, "welcome");
  console.log("joined:", p.id, "job:", p.profile.main_job);
  console.log("unlocked:", p.profile.skills.filter(s => s.unlocked).map(s => s.id).join(","));
  console.log("skill_points:", JSON.stringify(p.profile.skill_points));

  const pts = Object.entries(p.profile.skill_points ?? {}).find(([, v]) => v.available > 0);
  if (pts) {
    p.send("unlock_skill", { skill_id: "hex_ignis_hex" });
    await sleep(600);
    console.log("ignis unlocked:", p.profile.skills.find((s) => s.id === "hex_ignis_hex")?.unlocked);
  }

  await p.until((pl) => Object.values(pl.npcs).length > 0, "npcs");
  for (let i = 0; i < 80 && !p.rt; i++) {
    const npc = Object.values(p.npcs)[0];
    const s = p.worldPlayers[p.id];
    if (!npc || !s) break;
    const dx = npc.x - s.x, dy = npc.y - s.y, d = Math.hypot(dx, dy) || 1;
    p.send("move", { x: Math.round(s.x + (dx / d) * Math.min(72, d)), y: Math.round(s.y + (dy / d) * Math.min(72, d)) });
    await sleep(280);
  }
  await p.until((pl) => pl.rt !== null, "rt battle start");
  console.log("\nbattle started:", p.rt.id);
  for (const e of p.rt.entities.values()) console.log(`  ${e.id} ${e.name} @(${e.x.toFixed(0)},${e.y.toFixed(0)}) player=${e.is_player}`);

  const foe = foes()[0];

  // 1) attack at spawn distance (~440) — expect legit out of range
  await attack("attack", foe.id, "spawn distance");

  // 2) walk to ~50px (facing enemy) and attack — expect hit
  await approach(foe, 50);
  await sleep(500);
  await attack("attack", foe.id, "adjacent, facing");

  // 3) strafe sideways ~40px (facing now vertical) then attack — facing bug?
  const s = self();
  await moveStep(s.x, Math.min(460, s.y + 40));
  await sleep(500);
  await attack("attack", foe.id, "adjacent, sideways facing");

  const foe2 = foes()[0];
  if (foe2) {
    // 4) ranged spell adjacent — should hit
    await approach(p.rt.entities.get(foe2.id) ?? foe2, 60);
    await sleep(500);
    await attack("hex_ignis_hex", foe2.id, "spell adjacent (should hit)");

    // 5) back off to ~330px — beyond 320, legit fail
    for (let i = 0; i < 20; i++) {
      const s2 = self(); const f = p.rt.entities.get(foe2.id);
      if (!s2 || !f) break;
      if (Math.hypot(f.x - s2.x, f.y - s2.y) >= 330) break;
      const dx = s2.x - f.x, dy = s2.y - f.y, m = Math.hypot(dx, dy) || 1;
      await moveStep(s2.x + (dx / m) * 25, s2.y + (dy / m) * 25);
    }
    await sleep(500);
    await attack("hex_ignis_hex", foe2.id, "spell ~330 (should fail)");

    // 6) mid range ~200 — should hit
    await approach(p.rt.entities.get(foe2.id) ?? foe2, 200);
    await sleep(500);
    await attack("hex_ignis_hex", foe2.id, "spell ~200 (should hit)");
  }

  await sleep(500);
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
setTimeout(() => { console.error("timed out"); process.exit(1); }, 120_000);
