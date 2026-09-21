// Repro: join -> pitch camp -> enter -> leave -> inspect world_state POIs.
const URL = "ws://localhost:8080/ws";
const HTTP = "http://localhost:8080";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function authToken(username) {
  const password = "repro-pass-1";
  for (const path of ["/api/register", "/api/login"]) {
    const res = await fetch(HTTP + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) return (await res.json()).token;
  }
  throw new Error("auth failed");
}

const log = [];
function record(dir, env) {
  const p = env.payload ?? {};
  const brief =
    env.type === "world_state"
      ? `entities=${(p.entities ?? []).length} save_points=${(p.save_points ?? []).length} job_changers=${(p.job_changers ?? []).length} camps=${(p.camps ?? []).length} map=${p.map ? `${p.map.cols}x${p.map.rows}` : "null"}`
      : env.type === "welcome"
        ? `map=${p.map ? `${p.map.id} ${p.map.overworld?.cols}x${p.map.overworld?.rows}` : "null"}`
        : env.type === "camp_state"
          ? `camps=${(p.camps ?? []).length}`
          : env.type === "house_state"
            ? `owner=${p.owner_name}`
            : "";
  log.push(`${dir} ${env.type} ${brief}`);
}

async function main() {
  const suffix = Date.now().toString(36);
  const name = "Camper" + suffix;
  const token = await authToken("repro-" + suffix);
  const ws = new WebSocket(`${URL}?token=${token}`);
  const waiters = [];
  const until = (pred, label, ms = 30000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout: " + label)), ms);
      waiters.push({ pred, resolve: (v) => { clearTimeout(t); resolve(v); } });
    });
  let self = null;
  let lastWorld = null;
  ws.addEventListener("message", (evt) => {
    const env = JSON.parse(evt.data);
    record("S>", env);
    if (env.type === "welcome") self = env.payload.player_id;
    if (env.type === "world_state") lastWorld = env.payload;
    for (const w of [...waiters]) if (w.pred(env)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(env); }
  });
  const send = (type, payload) => ws.send(JSON.stringify({ type, payload }));
  await new Promise((r) => ws.addEventListener("open", r));
  send("join_world", { player_name: name, race: "humanus", main_job: "VAN" });
  await until((e) => e.type === "world_state" && (e.payload?.save_points ?? []).length >= 0, "first world_state");
  console.log("joined. initial world_state:", JSON.stringify({ sp: lastWorld.save_points?.length, jc: lastWorld.job_changers?.length, camps: lastWorld.camps?.length, map: `${lastWorld.map?.cols}x${lastWorld.map?.rows}` }));
  const me = lastWorld.entities.find((e) => e.id === self);
  console.log("self at", me?.x, me?.y);

  // Pitch camp.
  send("use_world_skill", { skill_id: "camp" });
  await until((e) => e.type === "camp_state" && (e.payload?.camps ?? []).length > 0, "camp pitched").catch(() => null);
  await sleep(300);
  console.log("after camp skill:");
  for (const l of log.slice(-6)) console.log("   ", l);

  // Enter the camp (tent is ~40px south; server allows 80px interact range).
  send("enter_house", { owner_name: name });
  const hs = await until((e) => e.type === "house_state", "house_state").catch((e) => { console.log("enter failed:", e.message); return null; });
  if (!hs) { console.log("FULL LOG:"); log.forEach((l) => console.log("   ", l)); process.exit(1); }
  console.log("inside house. messages since enter:");
  const enterIdx = log.findIndex((l) => l.includes("house_state"));
  log.slice(Math.max(0, enterIdx - 8), enterIdx + 1).forEach((l) => console.log("   ", l));

  // Leave the house.
  log.push("--- leave_house sent ---");
  send("leave_house", {});
  const ret = await until((e) => e.type === "world_state" && (e.payload?.entities ?? []).some((x) => x.id === self && !x.in_house), "return world_state").catch((e) => { console.log("return failed:", e.message); return null; });
  await sleep(400);
  console.log("\nreturn flow messages:");
  const li = log.findIndex((l) => l.includes("leave_house sent"));
  log.slice(li).forEach((l) => console.log("   ", l));
  if (ret) {
    const p = ret.payload;
    console.log("\nRETURN world_state POIs: save_points=%d job_changers=%d camps=%d map=%sx%s",
      (p.save_points ?? []).length, (p.job_changers ?? []).length, (p.camps ?? []).length, p.map?.cols, p.map?.rows);
  }
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
