import { net } from "../net/socket";
import type { ProfileInfo } from "../types";

/** Pets collection: follow / battle ally / release. */
export function PetsPane({ profile }: { profile: ProfileInfo }) {
  const pets = profile.pets ?? [];
  if (pets.length === 0) {
    return (
      <div className="cm-pets">
        <p className="hint">
          No pets yet. Weaken a capturable foe below 20% HP in battle and use the Capture skill (hotbar).
        </p>
      </div>
    );
  }
  return (
    <div className="cm-pets">
      <p className="hint cm-bag-hint">
        Follow appears beside you in the field. Battle ally joins fights with AI (you may queue one
        command).
      </p>
      <ul className="cm-pet-list">
        {pets.map((pet) => {
          const following = profile.follow_pet_id === pet.id;
          const battling = profile.battle_pet_id === pet.id;
          return (
            <li key={pet.id} className="cm-pet-row">
              <div className="cm-pet-info">
                <strong>{pet.name}</strong>
                <span className="dim">
                  {pet.kind} · Lv {pet.level}
                </span>
              </div>
              <div className="cm-pet-actions">
                <button
                  type="button"
                  className={`cm-btn ${following ? "on" : ""}`}
                  onClick={() => net.petSetFollow(following ? "" : pet.id)}
                >
                  {following ? "Following" : "Follow"}
                </button>
                <button
                  type="button"
                  className={`cm-btn ${battling ? "on" : ""}`}
                  onClick={() => net.petSetBattle(battling ? "" : pet.id)}
                >
                  {battling ? "Battle Ally" : "Set Ally"}
                </button>
                <button type="button" className="cm-btn cm-btn-danger" onClick={() => net.petRelease(pet.id)}>
                  Release
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
