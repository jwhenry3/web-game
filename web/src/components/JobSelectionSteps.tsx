import { ALL_JOBS } from "../types";

export function JobSelectionSteps({
  step,
  mainJob,
  subJob,
  onMainJob,
  onSubJob,
}: {
  step: "main" | "sub";
  mainJob: string;
  subJob: string;
  onMainJob: (jobId: string) => void;
  onSubJob: (jobId: string) => void;
}) {
  if (step === "main") {
    return (
      <div className="job-grid job-grid-compact">
        {ALL_JOBS.map((j) => (
          <button
            key={j.id}
            type="button"
            className={`job-card job-card--inline ${mainJob === j.id ? "selected" : ""}`}
            onClick={() => onMainJob(j.id)}
          >
            <span className="job-swatch" style={{ background: j.color }} />
            <span className="job-name">{j.name}</span>
          </button>
        ))}
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
        {ALL_JOBS.filter((j) => j.id !== mainJob).map((j) => (
          <button
            key={j.id}
            type="button"
            className={`job-card job-card--inline ${subJob === j.id ? "selected" : ""}`}
            onClick={() => onSubJob(j.id)}
          >
            <span className="job-swatch" style={{ background: j.color }} />
            <span className="job-name">{j.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}
