import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { ALL_JOBS, comboDisplayName } from "../types";
import { JobSelectionSteps } from "./JobSelectionSteps";

const MODE_LABELS = {
  main: "Choose Main Class",
  sub: "Choose Subclass",
} as const;

export function JobChangeDialog() {
  const dialog = useGame((s) => s.jobChangeDialog);
  const profile = useGame((s) => s.profile);
  const close = useGame((s) => s.closeJobChangeDialog);
  const [mainJob, setMainJob] = useState("");
  const [subJob, setSubJob] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dialog || !profile) return;
    setMainJob(profile.main_job);
    setSubJob(profile.sub_job ?? "");
    setError(null);
  }, [dialog?.id, dialog?.mode, profile?.main_job, profile?.sub_job]);

  if (!dialog || !profile) return null;

  const mode = dialog.mode;
  const canSub = profile.level >= profile.subjob_unlock_level;
  const unlockedJobs = profile.unlocked_jobs ?? [];

  const applyMainJob = (next: string) => {
    setMainJob(next);
    if (subJob === next) setSubJob("");
  };

  const confirm = () => {
    setError(null);
    if (mode === "main") {
      if (!mainJob) {
        setError("Select a main job.");
        return;
      }
      if (!unlockedJobs.includes(mainJob)) {
        setError("You have not unlocked that job yet.");
        return;
      }
      const nextSub = subJob === mainJob ? "" : subJob;
      if (nextSub && !unlockedJobs.includes(nextSub)) {
        setError("You have not unlocked that sub job yet.");
        return;
      }
      const newMainLevel = profile.jobs?.find((j) => j.id === mainJob)?.level ?? 1;
      if (nextSub && newMainLevel < profile.subjob_unlock_level) {
        setError(`Sub job unlocks at main job level ${profile.subjob_unlock_level}. Clear sub first or level this job.`);
        return;
      }
      if (mainJob === profile.main_job && nextSub === (profile.sub_job || "")) {
        close();
        return;
      }
      net.setJobs(mainJob, nextSub, dialog.id);
      close();
      return;
    }

    if (subJob && subJob === profile.main_job) {
      setError("Sub job must differ from main job.");
      return;
    }
    if (subJob && !canSub) {
      setError(`Sub job unlocks at main job level ${profile.subjob_unlock_level}.`);
      return;
    }
    if (subJob && !unlockedJobs.includes(subJob)) {
      setError("You have not unlocked that job yet.");
      return;
    }
    if ((subJob || "") === (profile.sub_job || "")) {
      close();
      return;
    }
    net.setJobs(profile.main_job, subJob, dialog.id);
    close();
  };

  const mainName = ALL_JOBS.find((j) => j.id === (mode === "main" ? mainJob : profile.main_job))?.name ?? mainJob;

  return createPortal(
    <div className="cm-skill-dialog-layer" onPointerDown={close}>
      <div className="cm-window login-panel job-change-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="cm-titlebar">
          <span className="cm-title">{dialog.name}</span>
        </div>
        <div className="cm-body">
          <div className="cm-section-label">{MODE_LABELS[mode]}</div>
          {mode === "sub" && (
            <p className="hint cm-job-change-current">
              Main: <strong>{mainName}</strong>
            </p>
          )}
          <JobSelectionSteps
            step={mode}
            mainJob={mode === "main" ? mainJob : profile.main_job}
            subJob={subJob}
            unlockedJobs={mode === "sub" && !canSub ? [] : unlockedJobs}
            onMainJob={applyMainJob}
            onSubJob={setSubJob}
          />
          {mode === "sub" && !canSub && (
            <p className="hint">Sub job unlocks at main job level {profile.subjob_unlock_level}.</p>
          )}
          {mode === "sub" && (
            <p className="hint cm-job-change-summary">
              Combo preview: {comboDisplayName(profile.main_job, subJob || undefined)}
            </p>
          )}
          {mode === "main" && (
            <p className="hint cm-job-change-summary">
              Combo preview: {comboDisplayName(mainJob, subJob || undefined)}
            </p>
          )}
          {error && <div className="error-text">{error}</div>}
          <div className="cm-wizard-nav">
            <button type="button" className="cm-btn" onClick={close}>
              Cancel
            </button>
            <button type="button" className="cm-btn gold" onClick={confirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
