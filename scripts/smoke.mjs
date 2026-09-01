// End-to-end protocol smoke test: drives two simulated players through the
// full flow (join world -> chat -> shared battle instance -> victory).
// Usage: node scripts/smoke.mjs   (server must be running on :8080)

const URL = "ws://localhost:8080/ws";
const deadline = setTimeout(() => {
  console.error("FAIL: smoke test timed out after 60s");
  process.exit(1);
}, 120_000);

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

function makePlayer(name, weapon) {
  const ws = new WebSocket(URL);
  const p = {
    name,
    ws,
    id: null,
    profile: null,
    battle: null, // { id, entities: Map }
    battleEnd: null,
    chatSeen: [],
    worldPlayers: {},
    npcs: {},
    battles: [],
    send: (type, payload) => ws.send(JSON.stringify({ type, payload })),
    waiters: [],
  };
  ws.addEventListener("open", () => p.send("join_world", { player_name: name, weapon }));
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
        p.battles = pl.battles ?? [];
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
      case "battle_list":
        p.battles = pl.battles ?? [];
        break;
      case "npc_state":
        for (const n of pl.npcs ?? []) p.npcs[n.id] = n;
        break;
      case "battle_state":
        p.battle = { id: pl.battle_id, entities: new Map(pl.entities.map((e) => [e.id, e])) };
        break;
      case "battle_event":
        if (p.battle) {
          for (const u of pl.entities ?? []) {
            const e = p.battle.entities.get(u.id);
            if (e) Object.assign(e, u);
          }
        }
        break;
      case "battle_tick":
        if (p.battle) {
          for (const [id, atb] of Object.entries(pl.atb ?? {})) {
            const e = p.battle.entities.get(id);
            if (e) e.atb = atb;
          }
        }
        break;
      case "battle_end":
        p.battleEnd = pl;
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

async function collideWithNPC(p, label) {
  await p.until((pl) => Object.values(pl.npcs).length > 0, `${label} sees npcs`);
  for (let i = 0; i < 80 && !p.battle; i++) {
    const target = Object.values(p.npcs)[0];
    const self = p.worldPlayers[p.id];
    if (!target || !self) break;
    const dx = target.x - self.x;
    const dy = target.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = Math.min(72, dist);
    p.send("move", {
      x: Math.round(self.x + (dx / dist) * step),
      y: Math.round(self.y + (dy / dist) * step),
    });
    await sleep(280);
  }
  await p.until((pl) => pl.battle !== null, `${label} npc battle`);
}

async function main() {
  const suffix = Date.now().toString(36);
  const bartz = makePlayer("SmokeBartz-" + suffix, "sword");
  await bartz.until((p) => p.id !== null, "bartz welcome");
  const unlocked = bartz.profile.skills.filter((s) => s.unlocked).map((s) => s.id);
  check("welcome + starter weapon equipped", bartz.profile.equipped.weapon === "starter-sword",
    `id=${bartz.id} lv=${bartz.profile.level} unlocked=${unlocked.join(",")}`);
  check("skills locked until purchased",
    unlocked.includes("attack") &&
      !unlocked.includes("power_slash") &&
      !unlocked.includes("cleave"),
    `unlocked=${unlocked.join(",")}`);
  check("starter skill point per specialty",
    bartz.profile.skill_points?.swordplay?.available === 1,
    JSON.stringify(bartz.profile.skill_points?.swordplay));

  bartz.send("unlock_skill", { skill_id: "power_slash" });
  await bartz.until((p) => p.profile.skills.find((s) => s.id === "power_slash")?.unlocked, "unlock power_slash");
  check("spend skill point to unlock",
    bartz.profile.skill_points.swordplay.available === 0 &&
      bartz.profile.skills.find((s) => s.id === "power_slash").unlocked);

  bartz.send("set_hotbar", { slot: "3", kind: "skill", id: "power_slash" });
  await bartz.until((p) => p.profile.hotbar?.["3"]?.id === "power_slash", "hotbar bind");
  check("hotbar bind", bartz.profile.hotbar["3"].kind === "skill");

  const lenna = makePlayer("SmokeLenna-" + suffix, "staff");
  await lenna.until((p) => p.id !== null, "lenna welcome");
  await bartz.until((p) => Object.values(p.worldPlayers).some((w) => w.name === lenna.name), "bartz sees lenna");
  check("world roster sync", true, "both players visible in world");

  // Movement
  bartz.send("move", { x: 500, y: 400 });
  await lenna.until((p) => {
    const w = Object.values(p.worldPlayers).find((w) => w.name === bartz.name);
    return w && w.x === 500 && w.y === 400;
  }, "lenna sees bartz move");
  check("world movement broadcast", true, "position 500,400 propagated");

  // Chat
  bartz.send("chat", { message: "hello from the smoke test" });
  await lenna.until((p) => p.chatSeen.some((c) => c.includes("hello from the smoke test")), "chat received");
  check("world chat", true, lenna.chatSeen.at(-1));

  // Battle: server spawns when bartz walks into an NPC; lenna joins ("call for help")
  await collideWithNPC(bartz, "bartz");
  const battleId = bartz.battle.id;
  const enemyCount = [...bartz.battle.entities.values()].filter((e) => !e.is_player).length;
  check("battle instance created", enemyCount >= 2, `${battleId} with ${enemyCount} enemies`);

  await lenna.until((p) => p.battles.some((b) => b.battle_id === battleId), "lenna sees battle in list");
  lenna.send("join_battle", { battle_id: battleId });
  await lenna.until((p) => p.battle?.id === battleId, "lenna battle_state");
  await bartz.until(
    (p) => [...p.battle.entities.values()].filter((e) => e.is_player).length === 2,
    "bartz sees lenna in party",
  );
  check("party syncing into shared instance", true, "2 players in one battle room");

  // Combat-locked state visible in world layer
  await lenna.until((p) => {
    const w = Object.values(p.worldPlayers).find((w) => w.name === bartz.name);
    return w?.in_battle === true;
  }, "combat-locked flag");
  check("combat-locked (idle) state in world", true);

  // Locked players cannot move in the world
  const before = { ...Object.values(lenna.worldPlayers).find((w) => w.name === bartz.name) };
  bartz.send("move", { x: 100, y: 100 });
  await sleep(600);
  const after = Object.values(lenna.worldPlayers).find((w) => w.name === bartz.name);
  check("world actions blocked while locked", after.x === before.x && after.y === before.y);

  // Fight until victory: each player attacks whenever their ATB is full.
  const fighter = (p) =>
    setInterval(() => {
      if (!p.battle || p.battleEnd) return;
      const self = p.battle.entities.get(p.id);
      if (!self || !self.alive || self.atb < 100) return;
      const enemy = [...p.battle.entities.values()].find((e) => !e.is_player && e.alive);
      if (enemy) p.send("action", { action_id: "attack", target_id: enemy.id });
    }, 150);
  const t1 = fighter(bartz);
  const t2 = fighter(lenna);

  await Promise.all([
    bartz.until((p) => p.battleEnd !== null, "bartz battle_end"),
    lenna.until((p) => p.battleEnd !== null, "lenna battle_end"),
  ]);
  clearInterval(t1);
  clearInterval(t2);

  const end = bartz.battleEnd;
  check("battle resolution broadcast", true, end.victory ? "victory" : "defeat");
  if (end.victory) {
    const reward = end.rewards.find((r) => r.player_id === bartz.id);
    check("XP awarded", reward && reward.xp > 0, `+${reward?.xp} xp, level ${reward?.new_level}`);
    check("procedural loot dropped", reward && reward.loot.length > 0,
      reward?.loot.map((l) => {
        const stats = Object.entries(l.stats ?? {}).map(([k, v]) => `+${v}${k}`).join(" ");
        return `${l.rarity} ${l.name}${stats ? ` [${stats}]` : ""}`;
      }).join("; "));
  }

  // Unlock after battle
  await lenna.until((p) => {
    const w = Object.values(p.worldPlayers).find((w) => w.name === bartz.name);
    return w?.in_battle === false;
  }, "bartz unlocked after battle");
  check("players released to world after battle", true);

  // The post-battle welcome push carries usage-based proficiency gains.
  await bartz.until((p) => (p.profile.proficiency?.swordplay ?? 0) > 0, "bartz proficiency sync");
  await lenna.until((p) => (p.profile.proficiency?.sorcery ?? 0) > 0, "lenna proficiency sync");
  check("armory proficiency from weapon usage",
    bartz.profile.proficiency.swordplay > 0 && lenna.profile.proficiency.sorcery > 0,
    `bartz swordplay=${bartz.profile.proficiency.swordplay}, lenna sorcery=${lenna.profile.proficiency.sorcery}`);

  // Equip a piece of victory loot into one of the expanded slots.
  const lootItem = bartz.profile.inventory.find(
    (i) => i.kind !== "consumable" && i.id !== "starter-sword" && i.slot,
  );
  if (lootItem) {
    bartz.send("equip", { item_id: lootItem.id });
    await bartz.until((p) => p.profile.equipped[lootItem.slot] === lootItem.id, "equip confirmed");
    check("equip loot into expanded slot", true, `${lootItem.slot}: ${lootItem.name}`);
    bartz.send("unequip", { slot: lootItem.slot });
    await bartz.until((p) => p.profile.equipped[lootItem.slot] === undefined, "unequip confirmed");
    check("unequip slot", true);
  } else {
    check("equip loot into expanded slot", false, "no loot item found to equip");
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
