import { useGame } from "../state/store";
import { comboDisplayName } from "../types";

export function ExpBar() {
  const profile = useGame((s) => s.profile);
  if (!profile) return null;

  const xpPct = Math.min(100, (profile.xp / Math.max(profile.max_xp, 1)) * 100);
  const classLabel = comboDisplayName(profile.main_job, profile.sub_job || undefined);

  return (
    <div className="cm-exp-bar" aria-label={`Experience ${profile.xp} of ${profile.max_xp}`}>
      <div className="cm-exp-fill" style={{ width: `${xpPct}%` }} />
      <span className="cm-exp-text">
        {classLabel} Lv {profile.level} · {profile.xp} / {profile.max_xp} EXP
      </span>
    </div>
  );
}
