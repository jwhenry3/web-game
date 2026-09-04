import type { Envelope, MessageType } from "../types";

/** Game transport — browser WebSocket or Wails Go bridge. */

export interface GameTransport {
  connect(token: string, onReady?: () => void): void;
  disconnect(): void;
  send(type: MessageType, payload?: unknown): void;
  isOpen(): boolean;
}

export type TransportHandlers = {
  onOpen?: () => void;
  onMessage?: (env: Envelope) => void;
  onClose?: (intentional: boolean) => void;
  onError?: (message: string) => void;
};

let transport: GameTransport | null = null;
let handlers: TransportHandlers = {};

export function setGameTransport(t: GameTransport | null): void {
  transport = t;
}

export function getGameTransport(): GameTransport | null {
  return transport;
}

export function setTransportHandlers(h: TransportHandlers): void {
  handlers = h;
}

export function notifyTransportOpen(): void {
  handlers.onOpen?.();
}

export function notifyTransportMessage(env: Envelope): void {
  handlers.onMessage?.(env);
}

export function notifyTransportClose(intentional: boolean): void {
  handlers.onClose?.(intentional);
}

export function notifyTransportError(message: string): void {
  handlers.onError?.(message);
}

export function transportSend(type: MessageType, payload?: unknown): void {
  if (transport) {
    transport.send(type, payload);
    return;
  }
  throw new Error("game transport not initialized");
}

export function transportConnect(token: string, onReady?: () => void): void {
  if (!transport) throw new Error("game transport not initialized");
  transport.connect(token, onReady);
}

export function transportDisconnect(): void {
  transport?.disconnect();
}

export function transportIsOpen(): boolean {
  return transport?.isOpen() ?? false;
}
