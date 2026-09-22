import * as THREE from "three";
import type { WorldEntity } from "../types";
import { enemyDollAppearance, enemyKindFromName, type EnemyKind } from "../characters/enemies";
import { appearanceFromWire, applyGameWeapon, DEFAULT_APPEARANCE, type CharacterAppearance } from "../characters/heroes99";
import { buildRig, getRig, rigLibraryVersion, type RigInstance } from "./rigBuilder";
import type { RigPalette } from "./rig3d";

export interface Actor3D {
  root: THREE.Group;
  body: THREE.Group;
  /** The locomotion rig — the mount's when mounted, the actor's otherwise. */
  rig: RigInstance;
  /** Mounted player: the humanoid rider posed on the mount's seat. */
  rider: RigInstance | null;
  ring: THREE.Mesh;
  signature: string;
}

export function actorSignature(entity: WorldEntity) {
  return `${rigLibraryVersion}:${entity.kind}:${entity.sprite}:${entity.name}:${entity.main_job}:${entity.weapon}:${entity.sub_weapon}:${entity.mounted}:${entity.mount_sprite}:${entity.is_ally}:${entity.appearance ? JSON.stringify(entity.appearance) : ""}`;
}

/** Enemy kind → rig document + per-kind scale/palette (mirrors the old procedural builders). */
const ENEMY_RIG: Record<EnemyKind, { rig: string; scale: number; seat: number; palette?: Partial<RigPalette> }> = {
  goblin: { rig: "biped", scale: .85, seat: .42, palette: { legs: "#58492f" } },
  imp: { rig: "biped", scale: .75, seat: .45 },
  stone_imp: { rig: "biped", scale: .8, seat: .45, palette: { cloth: "#4f4f5e" } },
  dire_wolf: { rig: "quadruped", scale: 1, seat: .3 },
};

function entityAppearance(entity: WorldEntity, self: boolean): { appearance: CharacterAppearance; palette: Partial<RigPalette> } {
  const wire = appearanceFromWire(entity.appearance);
  // The equipped weapon overrides the creation-time weapon pick so the
  // hand prop matches the paperdoll ("" = bare hands, e.g. knuckles).
  const appearance = applyGameWeapon(wire ?? DEFAULT_APPEARANCE, entity.weapon, entity.sub_weapon);
  return { appearance, palette: wire ? {} : { cloth: self ? "#456879" : "#796584" } };
}

export function buildEnemyRig(kind: EnemyKind): { rig: RigInstance; seat: number } {
  const def = ENEMY_RIG[kind];
  return { rig: buildRig(getRig(def.rig), { appearance: enemyDollAppearance(kind), palette: def.palette, scale: def.scale }), seat: def.seat };
}

export function createActor(entity: WorldEntity, self: boolean): Actor3D {
  const root = new THREE.Group(), body = new THREE.Group();
  const hostile = entity.kind === "npc" && !entity.is_ally;
  let rig: RigInstance, rider: RigInstance | null = null;
  if (entity.kind === "player") {
    const { appearance, palette } = entityAppearance(entity, self);
    if (entity.mounted) {
      // The mount is the player's slotted pet — same rig as that enemy
      // kind, with the rider posed on its back.
      const kind = entity.mount_sprite ? enemyKindFromName(entity.mount_sprite, entity.mount_sprite) : "dire_wolf";
      const mount = buildEnemyRig(kind);
      rig = mount.rig; body.add(rig.root);
      rider = buildRig(getRig("humanoid"), { appearance, palette });
      rider.root.position.set(0, mount.seat, -.04);
      rider.applyPose(rider.doc.ridePose);
      body.add(rider.root);
    } else {
      rig = buildRig(getRig("humanoid"), { appearance, palette });
      body.add(rig.root);
    }
  } else {
    rig = buildEnemyRig(enemyKindFromName(entity.name, entity.sprite)).rig;
    body.add(rig.root);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(.39, .43, 40), new THREE.MeshBasicMaterial({ color: self ? 0xe3c788 : hostile ? 0xe98265 : 0x83c5bc, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .03; root.add(ring, body);
  root.userData.entityId = entity.id;
  root.userData.kind = entity.kind;
  return { root, body, rig, rider, ring, signature: actorSignature(entity) };
}

export function animateActor(actor: Actor3D, moving: boolean, time: number, alive: boolean, dt = 1 / 60) {
  actor.body.rotation.z = alive ? 0 : Math.PI / 2;
  // Rig limbs are declared with explicit phases — contralateral limbs share
  // a phase so opposite sides alternate and arms counter-swing their legs.
  actor.rig.update(dt, time, moving, alive);
  actor.rider?.update(dt, time, false, alive);
}

export { WorldVfx as WorldEffects } from "./vfx3d";
