import { ALL_JOBS, STARTING_JOBS } from "../types";

type JobOption = { id: string; name: string; color: string };

export function JobSelectionSteps({
  step,
  mainJob,
  subJob,
  onMainJob,
  onSubJob,
  /** When set, only these jobs are selectable; others are shown disabled (or hidden). */
  unlockedJobs,
  /** Creation uses starters only and hides advanced jobs entirely. */
  startersOnly = false,
  hideLocked = false,
}: {
  step: "main" | "sub";
  mainJob: string;
  subJob: string;
  onMainJob: (jobId: string) => void;
  onSubJob: (jobId: string) => void;
  unlockedJobs?: string[];
  startersOnly?: boolean;
  hideLocked?: boolean;
}) {
  const unlocked = new Set((unlockedJobs ?? []).map((j) => j.toUpperCase()));
  const catalog: JobOption[] = startersOnly
    ? STARTING_JOBS.map((j) => ({ id: j.id, name: j.name, color: j.color }))
    : ALL_JOBS.map((j) => ({ id: j.id, name: j.name, color: j.color }));

  const isUnlocked = (id: string) => {
    if (startersOnly) return true;
    if (!unlockedJobs) return true;
    return unlocked.has(id.toUpperCase());
  };

  const visible = catalog.filter((j) => !hideLocked || isUnlocked(j.id));

  if (step === "main") {
    return (
      <div className="job-grid job-grid-compact">
        {visible.map((j) => {
          const locked = !isUnlocked(j.id);
          return (
            <button
              key={j.id}
              type="button"
              className={`job-card job-card--inline ${mainJob === j.id ? "selected" : ""} ${locked ? "locked" : ""}`}
              disabled={locked}
              title={locked ? "Not unlocked yet" : undefined}
              onClick={() => !locked && onMainJob(j.id)}
            >
              <span className="job-swatch" style={{ background: j.color }} />
              <span className="job-name">{j.name}</span>
              {locked && <span className="job-lock dim">Locked</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <p className="hint">Sub job abilities contribute at half strength (FFXI-style).</p>
      <div className="job-grid job-grid-compact">
        <button
          type="button"
          className={`job-card job-card--inline ${!subJob ? "selected" : ""}`}
          onClick={() => onSubJob("")}
        >
          <span className="job-name">None</span>
        </button>
        {visible
          .filter((j) => j.id !== mainJob)
          .map((j) => {
            const locked = !isUnlocked(j.id);
            return (
              <button
                key={j.id}
                type="button"
                className={`job-card job-card--inline ${subJob === j.id ? "selected" : ""} ${locked ? "locked" : ""}`}
                disabled={locked}
                title={locked ? "Not unlocked yet" : undefined}
                onClick={() => !locked && onSubJob(j.id)}
              >
                <span className="job-swatch" style={{ background: j.color }} />
                <span className="job-name">{j.name}</span>
                {locked && <span className="job-lock dim">Locked</span>}
              </button>
            );
          })}
      </div>
    </>
  );
}
