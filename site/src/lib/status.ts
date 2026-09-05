export type StatusExpRates = {
  rate: number;
  main_percent: number;
  sub_percent: number;
};

export type StatusMapEntry = {
  id: string;
  name: string;
  enabled: boolean;
  running: boolean;
  players: number;
  battles: number;
  combat?: string;
};

export type StatusSnapshot = {
  ok: boolean;
  name: string;
  uptime_sec: number;
  players: number;
  battles: number;
  exp: StatusExpRates;
  maps: StatusMapEntry[];
};

type StatusEnvelope = {
  type: string;
  payload: StatusSnapshot;
};

export async function fetchStatus(): Promise<StatusSnapshot> {
  const res = await fetch("/api/status", { cache: "no-store" });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as StatusSnapshot;
}

function statusWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/status/ws`;
}

/** Live status via WebSocket; falls back to HTTP polling if WS fails. */
export function subscribeStatus(
  onUpdate: (snap: StatusSnapshot, source: "ws" | "poll") => void,
): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let pollTimer = 0;
  let retryTimer = 0;

  const stopPoll = () => {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = 0;
  };

  const startPoll = () => {
    stopPoll();
    const tick = () => {
      void fetchStatus()
        .then((snap) => onUpdate(snap, "poll"))
        .catch(() => {});
    };
    tick();
    pollTimer = window.setInterval(tick, 4000);
  };

  const connect = () => {
    if (stopped) return;
    try {
      ws = new WebSocket(statusWsUrl());
    } catch {
      startPoll();
      return;
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as StatusEnvelope;
        if (msg.type === "status" && msg.payload) onUpdate(msg.payload, "ws");
      } catch {
        /* ignore malformed */
      }
    };
    ws.onopen = () => stopPoll();
    ws.onerror = () => {
      ws?.close();
    };
    ws.onclose = () => {
      ws = null;
      if (stopped) return;
      startPoll();
      retryTimer = window.setTimeout(connect, 5000);
    };
  };

  connect();

  return () => {
    stopped = true;
    stopPoll();
    if (retryTimer) window.clearTimeout(retryTimer);
    ws?.close();
  };
}

export function formatUptime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}
