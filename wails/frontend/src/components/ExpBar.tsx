import { useGame } from "../state/store";

export function ExpBar() {
  const profile = useGame((s) => s.profile);
  if (!profile) return null;

  const xpPct = Math.min(100, (profile.xp / Math.max(profile.max_xp, 1)) * 100);

  return (
    <div className="xiv-exp-bar" aria-label={`Experience ${profile.xp} of ${profile.max_xp}`}>
      <div className="xiv-exp-fill" style={{ width: `${xpPct}%` }} />
      <span className="xiv-exp-text">
        {profile.main_job} Lv {profile.level} · {profile.xp} / {profile.max_xp} EXP
        {profile.sub_job ? ` · Sub ${profile.sub_job}` : ""}
      </span>
    </div>
  );
}
