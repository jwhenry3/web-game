// End-to-end protocol smoke test: drives two simulated players through the
// full flow (join world -> chat -> overworld combat -> kill -> rewards).
// Usage: node scripts/smoke.mjs   (server must be running on :8080)

import { findPath } from "./lib/path.mjs";

const URL = "ws://localhost:8080/ws";
const HTTP = "http://localhost:8080";
const deadline = setTimeout(() => {
  console.error("FAIL: smoke test timed out after 120s");
  process.exit(1);
}, 120_000);

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

// Register (or log in) a throwaway account and return its JWT.
async function authToken(username) {
  const password = "smoke-pass-1";
  for (const path of ["/api/register", "/api/login"]) {
    const res = await fetch(HTTP + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) return (await res.json()).token;
  }
  throw new Error(`auth failed for ${username}`);
}

function makePlayer(name, token, mainJob) {
  const ws = new WebSocket(`${URL}?token=${token}`);
  const p = {
    name,
    ws,
    id: null,
    profile: null,
    chatSeen: [],
    worldPlayers: {},
    npcs: {},
    map: null,
    combat: new Map(), // entity id -> CombatEntity
    rewards: [],
    send: (type, payload) => ws.send(JSON.stringify({ type, payload })),
    waiters: [],
  };
  ws.addEventListener("open", () =>
    p.send("join_world", { player_name: name, race: "humanus", main_job: mainJob }));
  ws.addEventListener("message", (evt) => {
    const env = JSON.parse(evt.data);
    const pl = env.payload;
    switch (env.type) {
      case "welcome":
        p.id = pl.player_id;
        p.profile = pl.profile;
        break;
      case "world_state":
        for (const wp of pl.players ?? []) p.worldPlayers[wp.id] = wp;
        for (const n of pl.npcs ?? []) p.npcs[n.id] = n;
        if (pl.map?.cells) p.map = pl.map;
        break;
      case "player_joined":
      case "player_sync":
        p.worldPlayers[pl.id] = pl;
        break;
      case "player_moved":
        if (p.worldPlayers[pl.id]) Object.assign(p.worldPlayers[pl.id], { x: pl.x, y: pl.y });
        break;
      case "chat_message":
        p.chatSeen.push(`${pl.from_name}: ${pl.message}`);
        break;
      case "npc_state":
        for (const n of pl.npcs ?? []) p.npcs[n.id] = n;
        break;
      case "combat_tick":
      case "combat_event":
        p.combat.clear();
        for (const e of pl.entities ?? []) p.combat.set(e.id, e);
        break;
      case "reward_notice":
        p.rewards.push(pl);
        break;
      case "error":
        console.log(`  (server->${name} error: ${pl.message})`);
        break;
    }
    for (const w of [...p.waiters]) {
      if (w.pred(p, env)) {
        p.waiters.splice(p.waiters.indexOf(w), 1);
        w.resolve(env);
      }
    }
  });
  p.until = (pred, label) =>
    new Promise((resolve, reject) => {
      if (pred(p, { type: "__poll" })) return resolve(null); // already satisfied
      const t = setTimeout(() => reject(new Error(`timeout waiting for: ${label}`)), 90_000);
      p.waiters.push({
        pred,
        resolve: (v) => {
          clearTimeout(t);
          resolve(v);
        },
      });
    });
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const selfPos = (p) => p.worldPlayers[p.id];
const nearestNPC = (p) => {
  const s = selfPos(p);
  let best = null, bestD = Infinity;
  for (const n of Object.values(p.npcs)) {
    if (n.hp !== undefined && n.hp <= 0) continue;
    const d = s ? Math.hypot(n.x - s.x, n.y - s.y) : 0;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
};

// Walk toward a target using A* over the map grid, so walls are routed
// around instead of slid into. Repaths each iteration to track a moving
// target; waypoints are consumed as the player reaches them.
async function walkToward(p, getTarget, stopDist) {
  let path = null;
  for (let i = 0; i < 240; i++) {
    const t = getTarget();
    const s = selfPos(p);
    if (!t || !s) return;
    const d = Math.hypot(t.x - s.x, t.y - s.y);
    if (d <= stopDist) return;
    if (!path || !path.length) {
      path = findPath(p.map, s.x, s.y, t.x, t.y) ?? [];
      if (!path.length) return; // unreachable
    }
    let wp = path[0];
    let wd = Math.hypot(wp.x - s.x, wp.y - s.y);
    if (wd <= 8) {
      path.shift();
      continue;
    }
    const step = Math.min(72, wd);
    p.send("move", {
      x: Math.round(s.x + ((wp.x - s.x) / wd) * step),
      y: Math.round(s.y + ((wp.y - s.y) / wd) * step),
    });
    await sleep(240);
    // Drop the path when the target moved to a different tile.
    const t2 = getTarget();
    const ts = p.map.tile;
    if (
      t2 && path.length &&
      (Math.floor(t2.x / ts) !== Math.floor(t.x / ts) ||
        Math.floor(t2.y / ts) !== Math.floor(t.y / ts))
    ) {
      path = null;
    }
  }
}

async function main() {
  const suffix = Date.now().toString(36);
  const bartz = makePlayer("SmokeBartz-" + suffix, await authToken("sm-bartz-" + suffix), "VAN");
  await bartz.until((p) => p.id !== null, "bartz welcome");
  check("welcome + starter weapon equipped", bartz.profile.equipped.weapon === "starter-sword",
    `id=${bartz.id} lv=${bartz.profile.level}`);
  check("starter skills unlocked",
    (bartz.profile.skills ?? []).some((s) => s.id === "attack"),
    "attack available");

  // Single unified hotbar: combat skills, field skills, and items all bind here.
  bartz.send("set_hotbar", { slot: "4", kind: "skill", id: "return" });
  await bartz.until((p) => p.profile.hotbar?.["4"]?.id === "return", "hotbar bind");
  check("field skill binds on unified hotbar", bartz.profile.hotbar["4"].kind === "skill");
  bartz.send("set_hotbar", { slot: "8", kind: "skill", id: "dodge" });
  await sleep(400);
  check("dodge rejected from hotbar (Shift keybind)",
    bartz.profile.hotbar?.["8"]?.id !== "dodge");

  const lenna = makePlayer("SmokeLenna-" + suffix, await authToken("sm-lenna-" + suffix), "HEX");
  await lenna.until((p) => p.id !== null, "lenna welcome");
  await bartz.until((p) => Object.values(p.worldPlayers).some((w) => w.name === lenna.name), "bartz sees lenna");
  check("world roster sync", true, "both players visible in world");

  // Movement (server clamps each frame to ~80px, so step to a nearby point)
  const bpos = selfPos(bartz);
  const moveTarget = { x: bpos.x + 60, y: bpos.y };
  bartz.send("move", moveTarget);
  await lenna.until((p) => {
    const w = Object.values(p.worldPlayers).find((w) => w.name === bartz.name);
    return w && Math.hypot(w.x - moveTarget.x, w.y - moveTarget.y) < 5;
  }, "lenna sees bartz move");
  check("world movement broadcast", true, `position ~${moveTarget.x},${moveTarget.y} propagated`);

  // Chat
  bartz.send("chat", { message: "hello from the smoke test" });
  await lenna.until((p) => p.chatSeen.some((c) => c.includes("hello from the smoke test")), "chat received");
  check("world chat", true, lenna.chatSeen.at(-1));

  // Overworld combat: walk into an NPC's aggro radius. If the foe patrols the
  // sanctuary border and proximity can't fire from inside the safe zone, an
  // attack pull is the other supported engagement path.
  await bartz.until((p) => Object.keys(p.npcs).length > 0, "bartz sees npcs");
  const foe = nearestNPC(bartz);
  await walkToward(bartz, () => bartz.npcs[foe.id] ?? bartz.combat.get(foe.id), 24);
  await sleep(2000);
  const engagedByProximity =
    bartz.worldPlayers[bartz.id]?.in_combat === true ||
    [...bartz.combat.values()].some((e) => e.id === bartz.id);
  if (!engagedByProximity) {
    bartz.send("set_target", { target_id: foe.id });
    bartz.send("action", { action_id: "attack", target_id: foe.id });
  }
  await bartz.until(
    (p) => p.worldPlayers[p.id]?.in_combat === true || [...p.combat.values()].some((e) => e.id === p.id),
    "bartz pulled into combat",
  );
  check(engagedByProximity ? "proximity aggro starts overworld combat" : "attack pull starts overworld combat", true);

  // Lenna joins the same fight by attacking the NPC.
  await lenna.until((p) => Object.keys(p.npcs).length > 0 || p.combat.size > 0, "lenna sees npcs");
  await walkToward(lenna, () => lenna.npcs[foe.id] ?? lenna.combat.get(foe.id), 60);
  lenna.send("action", { action_id: "attack", target_id: foe.id });
  await lenna.until(
    (p) => [...p.combat.values()].some((e) => e.id === p.id),
    "lenna appears in combat entities",
  );
  check("second player joins the same fight", true);

  // Fight until the NPC dies: attack on each GCD, staying in melee range.
  const fighter = (p) =>
    setInterval(() => {
      const foeEnt = p.combat.get(foe.id) ?? p.npcs[foe.id];
      const s = selfPos(p);
      if (!foeEnt || !s || foeEnt.alive === false || (foeEnt.hp ?? 1) <= 0) return;
      const d = Math.hypot(foeEnt.x - s.x, foeEnt.y - s.y);
      if (d > 60) {
        const step = Math.min(60, d - 50);
        p.send("move", {
          x: Math.round(s.x + ((foeEnt.x - s.x) / d) * step),
          y: Math.round(s.y + ((foeEnt.y - s.y) / d) * step),
        });
      }
      p.send("action", { action_id: "attack", target_id: foe.id });
    }, 2700);
  const t1 = fighter(bartz);
  const t2 = fighter(lenna);

  const dead = await Promise.race([
    bartz.until((p) => {
      const e = p.combat.get(foe.id);
      const n = p.npcs[foe.id];
      return (e && e.alive === false) || (n && n.hp === 0) || (n === undefined && p.combat.size === 0);
    }, "foe defeated"),
    bartz.until((p) => p.rewards.length > 0, "bartz reward notice"),
  ]);
  clearInterval(t1);
  clearInterval(t2);
  void dead;
  await bartz.until((p) => p.rewards.some((r) => r.victory), "bartz reward notice");
  check("per-kill XP reward", bartz.rewards.at(-1).xp > 0, `+${bartz.rewards.at(-1).xp} xp`);

  await lenna.until((p) => p.rewards.length > 0, "lenna reward notice");
  check("contributor share for second player", lenna.rewards.at(-1).xp > 0, `+${lenna.rewards.at(-1).xp} xp`);

  // Combat flag clears once nothing engages the players.
  await bartz.until((p) => p.worldPlayers[p.id] && !p.worldPlayers[p.id].in_combat, "bartz leaves combat");
  check("in_combat clears after the fight", true);

  // Dodge: move then Shift-dash — stamina should drop below 100.
  bartz.send("move", { x: selfPos(bartz).x + 20, y: selfPos(bartz).y });
  await sleep(120);
  bartz.send("dodge", {});
  await bartz.until((p) => (p.worldPlayers[p.id]?.stamina ?? 100) < 100, "stamina spent");
  check("dodge drains stamina", true, `stamina=${bartz.worldPlayers[bartz.id].stamina}`);

  // Equip a piece of victory loot if any dropped.
  const lootItem = bartz.profile.inventory.find(
    (i) => i.kind !== "consumable" && i.id !== "starter-sword" && i.slot,
  );
  if (lootItem) {
    bartz.send("equip", { item_id: lootItem.id });
    await bartz.until((p) => p.profile.equipped[lootItem.slot] === lootItem.id, "equip confirmed");
    check("equip loot", true, `${lootItem.slot}: ${lootItem.name}`);
  } else {
    check("equip loot", true, "no loot dropped this run (skipped)");
  }

  bartz.ws.close();
  lenna.ws.close();

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  clearTimeout(deadline);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
