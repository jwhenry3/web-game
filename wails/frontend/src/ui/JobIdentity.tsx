import type { CSSProperties, ReactNode } from "react";
import { ALL_JOBS } from "../types";

const ROLE_LABELS: Record<string, string> = {
  tank: "Tank",
  healer: "Healer",
  support: "Support",
  dps: "DPS",
};

export const ROLE_COLORS: Record<string, string> = {
  tank: "#91b8ff",
  healer: "#8ee0b1",
  support: "#d8b66f",
  dps: "#f09d92",
};

const WEAPON_LABELS: Record<string, string> = {
  sword: "Sword",
  hammer: "Hammer",
  axe: "Axe",
  spear: "Spear",
  katana: "Katana",
  staff: "Staff",
  wand: "Wand",
  dagger: "Dagger",
  knuckles: "Knuckles",
};

const WEAPON_PATHS: Record<string, ReactNode> = {
  sword: (
    <>
      <path d="M5 19 18 6" />
      <path d="M17 3.5 20.5 7" />
      <path d="M9 17 12 20" />
    </>
  ),
  hammer: (
    <>
      <path d="M6.5 19.5 15 11" />
      <path d="M12 4h6v5h-6z" transform="rotate(20 15 6.5)" />
    </>
  ),
  axe: (
    <>
      <path d="M8 21 17 6" />
      <path d="M14 4c3.5 0 6 2 6 6-3-2-5.8-1.5-8 .5" />
    </>
  ),
  spear: (
    <>
      <path d="M5 19 17 7" />
      <path d="M16 3l5 5-4 1-2-2z" />
    </>
  ),
  katana: (
    <>
      <path d="M5 18c5-4 10-9 15-14" />
      <path d="M10 16l3 3" />
      <path d="M5 18l2 2" />
    </>
  ),
  staff: (
    <>
      <path d="M6 21 15 12" />
      <circle cx="17" cy="7" r="4" />
      <path d="M17 5v4M15 7h4" />
    </>
  ),
  wand: (
    <>
      <path d="M5 20 14 11" />
      <path d="M17 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
    </>
  ),
  dagger: (
    <>
      <path d="M7 21 17 11" />
      <path d="M17 11l4-4" />
      <path d="M10 18l3 3" />
    </>
  ),
  knuckles: (
    <>
      <path d="M5 14c0-4 3-7 7-7s7 3 7 7v4H5z" />
      <path d="M8 14v-3M12 14V8M16 14v-3" />
    </>
  ),
};

function titleize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function jobMeta(jobId?: string) {
  return jobId ? ALL_JOBS.find((job) => job.id === jobId) : undefined;
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? titleize(role);
}

export function weaponLabel(weapon: string): string {
  return WEAPON_LABELS[weapon] ?? titleize(weapon);
}

export function JobRoleBadge({
  jobId,
  role,
  className = "",
}: {
  jobId?: string;
  role?: string;
  className?: string;
}) {
  const resolved = role ?? jobMeta(jobId)?.role;
  if (!resolved) return null;
  return (
    <span className={`job-role-badge job-role-badge--${resolved} ${className}`.trim()}>
      {roleLabel(resolved)}
    </span>
  );
}

export function WeaponTypeIcon({
  type,
  size = 18,
  className = "",
  style,
}: {
  type?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  if (!type) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`job-weapon-icon ${className}`.trim()}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {WEAPON_PATHS[type] ?? WEAPON_PATHS.sword}
    </svg>
  );
}

export function WeaponTypeBadge({
  jobId,
  weapon,
  role,
  showLabel = true,
  className = "",
}: {
  jobId?: string;
  weapon?: string;
  /** Role used to tint the weapon glyph; resolved from jobId when omitted. */
  role?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = jobMeta(jobId);
  const resolvedWeapon = weapon ?? meta?.weapon;
  const resolvedRole = role ?? meta?.role;
  if (!resolvedWeapon) return null;
  const label = weaponLabel(resolvedWeapon);
  return (
    <span
      className={`job-weapon-badge ${className}`.trim()}
      style={{ color: resolvedRole ? ROLE_COLORS[resolvedRole] : undefined }}
      title={`${label} weapon`}
    >
      <WeaponTypeIcon type={resolvedWeapon} />
      {showLabel && <span>{label}</span>}
    </span>
  );
}

export function JobIdentityBadges({
  jobId,
  role,
  weapon,
  showWeaponLabel = false,
  /** Icon-only contexts (nameplates, HUD rows): skip the role text pill. */
  iconOnly = false,
  className = "",
}: {
  jobId?: string;
  role?: string;
  weapon?: string;
  showWeaponLabel?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  const meta = jobMeta(jobId);
  const resolvedRole = role ?? meta?.role;
  const resolvedWeapon = weapon ?? meta?.weapon;
  if (!resolvedRole && !resolvedWeapon) return null;
  return (
    <span className={`job-identity ${className}`.trim()}>
      <WeaponTypeBadge jobId={jobId} weapon={resolvedWeapon} role={resolvedRole} showLabel={showWeaponLabel} />
      {!iconOnly && <JobRoleBadge role={resolvedRole} />}
    </span>
  );
}
