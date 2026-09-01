// Regression test for the defeat flow: a solo player walks into an NPC battle and
// never acts, so the enemies wipe the party. Verifies the battle_end frame is
// client-safe (rewards is an array, not null) and the player is released.
// Usage: node scripts/smoke-defeat.mjs   (server must be running on :8080)

const URL = "ws://localhost:8080/ws";
setTimeout(() => {
  console.error("FAIL: defeat smoke test timed out after 120s");
  process.exit(1);
}, 120_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ws = new WebSocket(URL);
let selfId = null;
let self = null;
let npcs = {};
let sawBattleEnd = false;
let walking = false;

function send(type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

async function walkTowardNPC() {
  if (walking || self?.in_battle) return;
  walking = true;
  const target = Object.values(npcs)[0];
  if (!target || !self) {
    walking = false;
    return;
  }
  for (let i = 0; i < 80 && !self?.in_battle; i++) {
    const dx = target.x - self.x;
    const dy = target.y - self.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = Math.min(72, dist);
    send("move", {
      x: Math.round(self.x + (dx / dist) * step),
      y: Math.round(self.y + (dy / dist) * step),
    });
    await sleep(280);
  }
  walking = false;
}

ws.addEventListener("open", () => send("join_world", { player_name: "SmokeMartyr-" + Date.now().toString(36), weapon: "staff" }));

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
      for (const wp of pl.players ?? []) {
        if (wp.id === selfId) self = wp;
      }
      for (const n of pl.npcs ?? []) npcs[n.id] = n;
      if (selfId && !self?.in_battle && Object.keys(npcs).length > 0) {
        void walkTowardNPC();
      }
      break;
    case "player_sync":
      if (pl.id === selfId) {
        self = pl;
        if (sawBattleEnd && pl.in_battle === false) {
          console.log("PASS: player released from combat-locked state after defeat");
          ws.close();
          process.exit(0);
        }
      }
      break;
    case "player_moved":
      if (pl.id === selfId && self) Object.assign(self, { x: pl.x, y: pl.y });
      break;
    case "npc_state":
      for (const n of pl.npcs ?? []) npcs[n.id] = n;
      break;
    case "battle_state":
      console.log("battle started, standing idle until defeat...");
      break;
    case "battle_end": {
      console.log(`battle_end received: victory=${pl.victory}, raw rewards=${JSON.stringify(pl.rewards)}`);
      if (pl.victory !== false) {
        console.error("FAIL: expected defeat");
        process.exit(1);
      }
      if (!Array.isArray(pl.rewards)) {
        console.error("FAIL: rewards is not an array — clients would crash on the defeat screen");
        process.exit(1);
      }
      sawBattleEnd = true;
      console.log("PASS: defeat battle_end is client-safe");
      break;
    }
    case "error":
      console.error("FAIL: server error:", pl.message);
      process.exit(1);
  }
});

ws.addEventListener("close", () => {
  if (!sawBattleEnd) {
    console.error("FAIL: connection closed before defeat flow completed");
    process.exit(1);
  }
});
