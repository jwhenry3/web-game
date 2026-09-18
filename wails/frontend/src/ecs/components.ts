// Presentation-ECS components mirroring replicated world state.
//
// These components are populated by ecs/snapshot.ts from the zustand game
// state (entities, combatIds, selfId, savePoints, jobChangers, camps) and are
// consumed by presentation systems (Phaser sprite creation/interpolation,
// overlays, cleanup). They never write back to the replicated state.
import type {
  CharacterAppearance,
  EntityKind,
  StatusSnapshot,
  WorldEntity,
} from "../types";
import { component } from "./world";

/** Discriminator for the replicated record an ECS entity mirrors. */
export type ReplicatedKind = "entity" | "save_point" | "job_changer" | "camp";

/** Stable replicated identity, bound to the ECS entity at creation time. */
export interface Identity {
  /** Stable external id (e.g. "entity:<id>", "save_point:<id>"). */
  externalId: string;
  /** Which replicated record family this entity mirrors. */
  kind: ReplicatedKind;
}
export const Identity = component<Identity>();

/** Replication metadata for spawn/change detection by presentation systems. */
export interface ReplicationState {
  spawnedSeq: number;
  changedSeq: number;
}
export const ReplicationState = component<ReplicationState>();

/** Map/world revision this replicated record belongs to. */
export interface WorldScope {
  mapId: string;
}
export const WorldScope = component<WorldScope>();

/** Last replicated WorldEntity snapshot, kept verbatim for debugging/tools. */
export interface NetworkSnapshot {
  entity: WorldEntity;
  /** Monotonic sync generation that produced this snapshot. */
  seq: number;
}
export const NetworkSnapshot = component<NetworkSnapshot>();

/** Authoritative server position/facing for the latest snapshot. */
export interface AuthorityPose {
  x: number;
  y: number;
  facing?: number | string;
}
export const AuthorityPose = component<AuthorityPose>();

/**
 * Smoothed position actually rendered by Phaser. Initialized to the authority
 * pose on spawn; an interpolation system eases it toward AuthorityPose.
 */
export interface RenderPose {
  x: number;
  y: number;
  facing?: number | string;
  /** True while the authority pose moved since the last sync. */
  moving: boolean;
}
export const RenderPose = component<RenderPose>();

/** Hit-point/resource vitals driving bars and alive/dead presentation. */
export interface Vitals {
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  stamina?: number;
  level?: number;
  alive: boolean;
}
export const Vitals = component<Vitals>();

/** Combat-facing flags: engagement, cast state, statuses, capture/immune. */
export interface CombatState {
  /** In the combatIds set pushed by combat_tick. */
  inCombat: boolean;
  engaged: boolean;
  targetId?: string;
  statuses?: StatusSnapshot[];
  skillAtb?: number;
  hasQueuedAction?: boolean;
  castingSkillId?: string;
  castTargetId?: string;
  castProgress?: number;
  castTimeMs?: number;
  castEndsAt?: number;
  capturable?: boolean;
  immuneUntil?: number;
}
export const CombatState = component<CombatState>();

/** Visual identity: sprite, appearance, jobs — drives sprite (re)builds. */
export interface AppearanceState {
  name: string;
  kind: EntityKind;
  sprite?: string;
  ownerId?: string;
  isAlly: boolean;
  weapon?: string;
  mainJob?: string;
  subJob?: string;
  appearance?: CharacterAppearance;
  inHouse?: boolean;
  houseOwner?: string;
}
export const AppearanceState = component<AppearanceState>();

/** Tag: this replicated entity is the local player. */
export interface Self {
  self: true;
}
export const Self = component<Self>();

/**
 * Tag: the replicated record was absent from the latest sync. A later
 * presentation cleanup system tears down Phaser objects and then destroys
 * the ECS entity — snapshot sync never destroys directly.
 */
export interface Removed {
  /** Sync generation when the record first went missing. */
  since: number;
}
export const Removed = component<Removed>();

// ---------------------------------------------------------------------------
// POI marker components — replicated static/interactive map objects.
// ---------------------------------------------------------------------------

/** Save-point marker: replicated from state.savePoints. */
export interface SavePointState {
  id: string;
  name: string;
  x: number;
  y: number;
  active: boolean;
  seq: number;
}
export const SavePointState = component<SavePointState>();

/** Job-changer marker: replicated from state.jobChangers. */
export interface JobChangerState {
  id: string;
  name: string;
  x: number;
  y: number;
  seq: number;
}
export const JobChangerState = component<JobChangerState>();

/** Player camp marker: replicated from state.camps (keyed by owner name). */
export interface CampState {
  ownerId: string;
  ownerName: string;
  x: number;
  y: number;
  skin: string;
  seq: number;
}
export const CampState = component<CampState>();
