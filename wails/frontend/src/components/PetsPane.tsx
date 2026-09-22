import { useState } from "react";
import { ENEMY_KIND_LABELS, ENEMY_SPRITE_SRC, enemyKindFromName, type EnemyKind } from "../characters/enemies";
import { PetPreview3D } from "../characters/PetPreview3D";
import { net } from "../net/socket";
import { ICONS } from "../ui/icons";
import { GameIcon } from "../ui/GameIcon";
import { bindingToDisplay, mergeKeybinds } from "../input/keybinds";
import type { PetRecord, ProfileInfo } from "../types";

function petSpriteSrc(kind: string): string {
  return ENEMY_SPRITE_SRC[kind as EnemyKind] ?? ICONS.default;
}

function petKindLabel(kind: string): string {
  return (
    ENEMY_KIND_LABELS[kind as EnemyKind] ??
    kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Pets collection: list on the left, sprite preview + actions on the right. */
export function PetsPane({ profile }: { profile: ProfileInfo }) {
  const pets = profile.pets ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mountKey = bindingToDisplay(mergeKeybinds(profile.keybinds).mount ?? "r");
  const selected = pets.find((p) => p.id === selectedId) ?? pets[0];

  if (pets.length === 0) {
    return (
      <div className="cm-pets">
        <p className="hint">
          No pets yet. Weaken a capturable foe below 20% HP in battle and use the Capture skill
          (hotbar).
        </p>
      </div>
    );
  }

  const activeId = profile.battle_pet_id;
  const mountId = profile.mount_pet_id;

  return (
    <div className="cm-pets cm-pets--split">
      <ul className="cm-pet-list">
        {pets.map((pet) => (
          <li key={pet.id}>
            <button
              type="button"
              className={`cm-pet-row ${selected?.id === pet.id ? "selected" : ""}`}
              onClick={() => setSelectedId(pet.id)}
            >
              <GameIcon src={petSpriteSrc(pet.kind)} alt="" size={28} />
              <span className="cm-pet-info">
                <strong>{pet.name}</strong>
                <span className="dim">
                  {petKindLabel(pet.kind)} · Lv {pet.level}
                </span>
              </span>
              <span className="cm-pet-badges">
                {pet.id === activeId && <span className="cm-pet-badge">Active</span>}
                {pet.id === mountId && <span className="cm-pet-badge cm-pet-badge--mount">Mount</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <aside className="cm-pet-side">
          <div className="cm-pet-preview">
            <PetPreview3D
              kind={enemyKindFromName(selected.name, selected.kind)}
              width={150}
              height={150}
              walking={false}
            />
            <div className="cm-pet-preview-name">{selected.name}</div>
            <div className="dim">
              {petKindLabel(selected.kind)} · Lv {selected.level}
            </div>
          </div>
          <PetActions
            pet={selected}
            isActive={selected.id === activeId}
            isMount={selected.id === mountId}
          />
          <p className="hint cm-pet-mount-hint">
            Your active pet follows and fights beside you. Press {mountKey} to ride your mount.
          </p>
        </aside>
      )}
    </div>
  );
}

function PetActions({ pet, isActive, isMount }: { pet: PetRecord; isActive: boolean; isMount: boolean }) {
  return (
    <div className="cm-pet-actions">
      <button
        type="button"
        className={`cm-btn ${isActive ? "on" : ""}`}
        onClick={() => net.petSetBattle(isActive ? "" : pet.id)}
      >
        {isActive ? "Active" : "Set Active"}
      </button>
      <button
        type="button"
        className={`cm-btn ${isMount ? "on" : ""}`}
        onClick={() => net.petSetMount(isMount ? "" : pet.id)}
      >
        {isMount ? "Mount" : "Set Mount"}
      </button>
      <button type="button" className="cm-btn cm-btn-danger" onClick={() => net.petRelease(pet.id)}>
        Release
      </button>
    </div>
  );
}
