// Syncs replicated game state (the zustand store slice) into the
// presentation ECS world. Pure with respect to the store: it only reads the
// provided snapshot and only mutates the provided EntityWorld.
//
// Removal semantics: replicated records that disappear are tagged with the
// Removed component instead of being destroyed, so a later presentation
// cleanup system can tear down Phaser objects safely before destroying the
// ECS entity.
import type {
  JobChanger,
  SavePoint,
  WorldCamp,
  WorldEntity,
} from "../types";
import type { Entity, EntityWorld } from "./world";
import {
  AppearanceState,
  AuthorityPose,
  CampState,
  CombatState,
  Identity,
  JobChangerState,
  NetworkSnapshot,
  Removed,
  RenderPose,
  ReplicationState,
  SavePointState,
  Self,
  Vitals,
  WorldScope,
  type ReplicatedKind,
} from "./components";

/** The replicated slice of game state consumed by the snapshot sync. */
export interface SnapshotSource {
  entities: Record<string, WorldEntity>;
  combatIds: Record<string, true>;
  selfId: string | null;
  savePoints: Record<string, SavePoint>;
  jobChangers: Record<string, JobChanger>;
  camps: Record<string, WorldCamp>;
  activeSavePointId?: string;
  mapId?: string;
}

// ---------------------------------------------------------------------------
// Stable external ids — every replicated record maps to exactly one ECS entity.
// ---------------------------------------------------------------------------

export const entityExternalId = (id: string) => `entity:${id}`;
export const savePointExternalId = (id: string) => `save_point:${id}`;
export const jobChangerExternalId = (id: string) => `job_changer:${id}`;
export const campExternalId = (ownerName: string) => `camp:${ownerName}`;

// ---------------------------------------------------------------------------
// Sync implementation.
// ---------------------------------------------------------------------------

/**
 * Find-or-create the ECS entity for a replicated record. Revives entities
 * still pending cleanup (clears Removed), records the id in `seen`, and runs
 * the spawn/revive callbacks only for those transitions.
 */
function upsertRecord(
  world: EntityWorld,
  seen: Set<string>,
  externalId: string,
  kind: ReplicatedKind,
  seq: number,
  onSpawn?: (e: Entity) => void,
  onRevive?: (e: Entity) => void,
): Entity {
  seen.add(externalId);
  let e = world.entityByExternalId(externalId);
  if (e === undefined) {
    e = world.create(externalId);
    world.set(Identity, e, { externalId, kind });
    world.set(ReplicationState, e, { spawnedSeq: seq, changedSeq: seq });
    onSpawn?.(e);
    return e;
  }
  if (world.get(Removed, e) != null) {
    world.remove(Removed, e);
    const replication = world.get(ReplicationState, e);
    world.set(ReplicationState, e, {
      spawnedSeq: replication?.spawnedSeq ?? seq,
      changedSeq: seq,
    });
    onRevive?.(e);
  }
  return e;
}

function markChanged(world: EntityWorld, e: Entity, seq: number, changed: boolean): void {
  const replication = world.get(ReplicationState, e);
  if (!replication) {
    world.set(ReplicationState, e, { spawnedSeq: seq, changedSeq: seq });
    return;
  }
  if (changed && replication.changedSeq !== seq) {
    world.set(ReplicationState, e, { ...replication, changedSeq: seq });
  }
}

function syncScope(world: EntityWorld, e: Entity, source: SnapshotSource): boolean {
  const mapId = source.mapId ?? "";
  if (world.get(WorldScope, e)?.mapId === mapId) return false;
  world.set(WorldScope, e, { mapId });
  return true;
}

function syncEntities(
  world: EntityWorld,
  source: SnapshotSource,
  seen: Set<string>,
  seq: number,
): void {
  for (const w of Object.values(source.entities)) {
    const resetRenderPose = (e: Entity) => {
      world.set(RenderPose, e, { x: w.x, y: w.y, facing: w.facing, moving: false });
    };
    const e = upsertRecord(
      world,
      seen,
      entityExternalId(w.id),
      "entity",
      seq,
      resetRenderPose,
      resetRenderPose,
    );

    const inCombat = source.combatIds[w.id] === true;
    const isSelf = source.selfId !== null && w.id === source.selfId;
    const scopeChanged = syncScope(world, e, source);
    const dirty =
      world.get(NetworkSnapshot, e)?.entity !== w ||
      world.get(CombatState, e)?.inCombat !== inCombat ||
      (world.get(Self, e) != null) !== isSelf ||
      scopeChanged;

    if (dirty) {
      world.set(NetworkSnapshot, e, { entity: w, seq });
      world.set(AuthorityPose, e, { x: w.x, y: w.y, facing: w.facing });
      world.set(Vitals, e, {
        hp: w.hp,
        maxHp: w.max_hp,
        mp: w.mp,
        maxMp: w.max_mp,
        stamina: w.stamina,
        level: w.level,
        alive: w.alive,
      });
      world.set(CombatState, e, {
        inCombat,
        engaged: !!w.engaged,
        targetId: w.target_id,
        statuses: w.statuses,
        skillAtb: w.skill_atb,
        hasQueuedAction: w.has_queued_action,
        castingSkillId: w.casting_skill_id,
        castTargetId: w.cast_target_id,
        castProgress: w.cast_progress,
        castTimeMs: w.cast_time_ms,
        castEndsAt: w.cast_ends_at,
        capturable: w.capturable,
        immuneUntil: w.immune_until,
      });
      world.set(AppearanceState, e, {
        name: w.name,
        kind: w.kind,
        sprite: w.sprite,
        ownerId: w.owner_id,
        isAlly: !!w.is_ally,
        weapon: w.weapon,
        mainJob: w.main_job,
        subJob: w.sub_job,
        appearance: w.appearance,
        inHouse: w.in_house,
        houseOwner: w.house_owner,
      });
      markChanged(world, e, seq, true);
    }

    if (isSelf) {
      if (world.get(Self, e) == null) world.set(Self, e, { self: true });
    } else if (world.get(Self, e) != null) {
      world.remove(Self, e);
    }
  }
}

function syncSavePoints(
  world: EntityWorld,
  source: SnapshotSource,
  seen: Set<string>,
  seq: number,
): void {
  for (const p of Object.values(source.savePoints)) {
    const e = upsertRecord(world, seen, savePointExternalId(p.id), "save_point", seq);
    const active = source.activeSavePointId === p.id;
    const previous = world.get(SavePointState, e);
    const changed =
      syncScope(world, e, source) ||
      !previous ||
      previous.id !== p.id ||
      previous.name !== p.name ||
      previous.x !== p.x ||
      previous.y !== p.y ||
      previous.active !== active;
    if (changed) {
      world.set(SavePointState, e, { id: p.id, name: p.name, x: p.x, y: p.y, active, seq });
      markChanged(world, e, seq, true);
    }
  }
}

function syncJobChangers(
  world: EntityWorld,
  source: SnapshotSource,
  seen: Set<string>,
  seq: number,
): void {
  for (const j of Object.values(source.jobChangers)) {
    const e = upsertRecord(world, seen, jobChangerExternalId(j.id), "job_changer", seq);
    const previous = world.get(JobChangerState, e);
    const changed =
      syncScope(world, e, source) ||
      !previous ||
      previous.id !== j.id ||
      previous.name !== j.name ||
      previous.x !== j.x ||
      previous.y !== j.y;
    if (changed) {
      world.set(JobChangerState, e, { id: j.id, name: j.name, x: j.x, y: j.y, seq });
      markChanged(world, e, seq, true);
    }
  }
}

function syncCamps(
  world: EntityWorld,
  source: SnapshotSource,
  seen: Set<string>,
  seq: number,
): void {
  for (const c of Object.values(source.camps)) {
    const e = upsertRecord(world, seen, campExternalId(c.owner_name), "camp", seq);
    const previous = world.get(CampState, e);
    const changed =
      syncScope(world, e, source) ||
      !previous ||
      previous.ownerId !== c.owner_id ||
      previous.ownerName !== c.owner_name ||
      previous.x !== c.x ||
      previous.y !== c.y ||
      previous.skin !== c.skin;
    if (changed) {
      world.set(CampState, e, {
        ownerId: c.owner_id,
        ownerName: c.owner_name,
        x: c.x,
        y: c.y,
        skin: c.skin,
        seq,
      });
      markChanged(world, e, seq, true);
    }
  }
}

/**
 * Tag every replicated ECS entity whose record was absent from this sync.
 * Entities already tagged are left alone so `Removed.since` keeps the first
 * missing generation. Never destroys — cleanup is the presentation layer's job.
 */
function markMissing(world: EntityWorld, seen: Set<string>, seq: number): void {
  for (const e of world.query(Identity)) {
    const id = world.get(Identity, e);
    if (!id || seen.has(id.externalId)) continue;
    if (world.get(Removed, e) == null) {
      world.set(Removed, e, { since: seq });
    }
  }
}

/**
 * Sync one replicated snapshot into the ECS world. `seq` is owned by the
 * SnapshotSync instance so generations cannot interleave between worlds.
 */
export function syncSnapshot(world: EntityWorld, source: SnapshotSource, seq: number): number {
  const seen = new Set<string>();
  syncEntities(world, source, seen, seq);
  syncSavePoints(world, source, seen, seq);
  syncJobChangers(world, source, seen, seq);
  syncCamps(world, source, seen, seq);
  markMissing(world, seen, seq);
  return seq;
}

/** Stateful convenience wrapper binding an EntityWorld and its sync clock. */
export class SnapshotSync {
  private seq = 0;

  constructor(private readonly world: EntityWorld) {}

  sync(source: SnapshotSource): number {
    return syncSnapshot(this.world, source, ++this.seq);
  }

  /** Clears replicated state; presentation resources must be torn down first. */
  reset(): void {
    this.seq = 0;
    this.world.clear();
  }
}
