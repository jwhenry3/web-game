import type { MessageType } from "./types";
import {
  notifyTransportClose,
  notifyTransportError,
  notifyTransportMessage,
  notifyTransportOpen,
  type GameTransport,
} from "./net/transport";
import { Connect, Disconnect, IsConnected, SendEnvelope } from "../wailsjs/go/app/App";
import { EventsOn } from "../wailsjs/runtime/runtime";

let connected = false;
let readyCallback: (() => void) | undefined;
const unsubs: Array<() => void> = [];

export function wireTransportEvents(): void {
  if (unsubs.length > 0) return;

  unsubs.push(
    EventsOn("game:connected", () => {
      connected = true;
      notifyTransportOpen();
      readyCallback?.();
      readyCallback = undefined;
    }),
  );

  unsubs.push(
    EventsOn("game:envelope", (raw: string) => {
      try {
        notifyTransportMessage(JSON.parse(raw));
      } catch (err) {
        console.error("bad envelope from Go", err);
      }
    }),
  );

  unsubs.push(
    EventsOn("game:disconnected", (payload?: { intentional?: boolean }) => {
      connected = false;
      notifyTransportClose(payload?.intentional ?? false);
    }),
  );

  unsubs.push(
    EventsOn("game:error", (payload?: { message?: string }) => {
      notifyTransportError(payload?.message ?? "Could not reach the server.");
    }),
  );
}

export const wailsTransport: GameTransport = {
  connect(token, onReady) {
    readyCallback = onReady;
    void Connect(token).catch((err) => {
      notifyTransportError(err instanceof Error ? err.message : String(err));
    });
  },
  disconnect() {
    connected = false;
    void Disconnect();
  },
  send(type: MessageType, payload?: unknown) {
    void SendEnvelope(type, payload ? JSON.stringify(payload) : "");
  },
  isOpen() {
    return connected || false;
  },
};

void IsConnected().then((v) => {
  connected = v;
});
