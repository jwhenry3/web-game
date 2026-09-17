import { net } from "../net/socket";
import { useGame } from "../state/store";
import { isEnemyEntity } from "../types";
import { hudScaleKey, uiScaleFactor } from "../ui/uiScale";
import { useWindowDrag } from "./DraggableWindow";

/**
 * Floating pet command bar — draggable anywhere on screen. Attack sends every
 * active pet at the player's focus target; Heel calls them back to follow.
 */
export function PetHotbar() {
  const profile = useGame((s) => s.profile);
  const entities = useGame((s) => s.entities);
  const selfId = useGame((s) => s.selfId);
  const scale = useGame((s) => uiScaleFactor(s.options.uiScale, hudScaleKey("petbar")));
  const { style, titlebarProps } = useWindowDrag("pet-hotbar", scale);
  // The whole bar is the drag surface; useWindowDrag already skips buttons.
  const { className: _titlebarClass, ...dragProps } = titlebarProps;

  if (!profile) return null;
  const actives = (profile.pets ?? []).filter(
    (p) => p.id === profile.follow_pet_id || p.id === profile.battle_pet_id,
  );
  if (actives.length === 0) return null;

  const self = selfId ? entities[selfId] : undefined;
  const focus = self?.target_id ? entities[self.target_id] : undefined;
  const canAttack = !!focus && isEnemyEntity(focus) && focus.alive;

  return (
    <div
      className="pet-bar"
      style={style}
      {...dragProps}
      onMouseDown={(e) => e.stopPropagation()}
      title="Drag to move"
    >
      {actives.map((p) => {
        const e = entities[p.id];
        const pct =
          e && e.max_hp > 0 ? Math.max(0, Math.min(100, (e.hp / e.max_hp) * 100)) : null;
        return (
          <div key={p.id} className="pet-bar-pet">
            <span className="pet-bar-name">
              {p.name}
              <span className="dim"> Lv{e?.level ?? p.level}</span>
            </span>
            {pct != null && (
              <div className="ff-gauge-track pet-bar-hp">
                <div
                  className="ff-gauge-fill"
                  style={{ width: `${pct}%`, background: "#3dcc6e" }}
                />
              </div>
            )}
          </div>
        );
      })}
      <div className="pet-bar-actions">
        <button
          type="button"
          tabIndex={-1}
          className="ff-pet-cmd"
          disabled={!canAttack}
          title={canAttack ? `Send pets at ${focus!.name}` : "Target an enemy first"}
          onClick={() => net.petCommand("attack")}
        >
          Attack
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="ff-pet-cmd"
          title="Call pets back — they stop attacking and follow"
          onClick={() => net.petCommand("heel")}
        >
          Heel
        </button>
      </div>
    </div>
  );
}
