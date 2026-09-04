import type { StatusSnapshot } from "../types";

const STATUS_META: Record<
  string,
  { label: string; color: string; describe: (s: StatusSnapshot) => string }
> = {
  defense_up: {
    label: "DEF+",
    color: "#6ec9ff",
    describe: (s) => `Protect — −${Math.round(s.potency * 100)}% damage taken (${secs(s)}s)`,
  },
  defense_down: {
    label: "DEF−",
    color: "#ff8a6e",
    describe: (s) => `Weaken — +${Math.round(s.potency * 100)}% damage taken (${secs(s)}s)`,
  },
  attack_up: {
    label: "ATK+",
    color: "#f5d76e",
    describe: (s) => `Boost — +${Math.round(s.potency * 100)}% damage dealt (${secs(s)}s)`,
  },
  attack_down: {
    label: "ATK−",
    color: "#c9a06e",
    describe: (s) => `Sap — −${Math.round(s.potency * 100)}% damage dealt (${secs(s)}s)`,
  },
  shield: {
    label: "SHD",
    color: "#b8a0ff",
    describe: (s) => `Shield — ${s.shield_hp ?? 0} HP remaining (${secs(s)}s)`,
  },
  regen: {
    label: "REG",
    color: "#6ee7a8",
    describe: (s) => `Regen — restores HP over time (${secs(s)}s)`,
  },
  poison: {
    label: "PSN",
    color: "#a86eff",
    describe: (s) => `Poison — damage over time (${secs(s)}s)`,
  },
  haste: {
    label: "HST",
    color: "#7ad4ff",
    describe: (s) => `Haste — +${Math.round(s.potency * 100)}% action speed (${secs(s)}s)`,
  },
  stun: {
    label: "STN",
    color: "#ffcc44",
    describe: (s) => `Stun — cannot act (${secs(s)}s)`,
  },
};

function secs(s: StatusSnapshot): number {
  return Math.max(1, Math.round((s.remaining * 200) / 1000));
}

export function statusLabel(kind: string): string {
  return STATUS_META[kind]?.label ?? kind.slice(0, 3).toUpperCase();
}

export function statusColor(kind: string): string {
  return STATUS_META[kind]?.color ?? "#cccccc";
}

export function statusTooltip(s: StatusSnapshot): string {
  return STATUS_META[s.kind]?.describe(s) ?? s.kind;
}
