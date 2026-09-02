import { useEffect, useMemo, useRef, useState } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { CharacterPreviewAnimated } from "../characters/CharacterPreview";
import { saveDraftAppearance } from "../characters/appearanceStorage";
import {
  APPEARANCE_OPTIONS,
  appearanceOptionAt,
  appearanceOptionIndex,
  appearanceToWire,
  mergeAppearance,
  type CharacterAppearance,
} from "../characters/types";
import { ALL_JOBS } from "../types";
import type { CreationDraft } from "../state/store";
import { jobGridNeighbor, layoutJobGrid, treeNavDirection } from "../ui/jobGridNav";
import { useMenuPanelFocus } from "../ui/useMenuPanelFocus";

const DEFAULT_RACE = "hume";

const STEPS = ["appearance", "main", "sub", "name"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  appearance: "Customize Appearance",
  main: "Choose Main Job",
  sub: "Choose Sub Job",
  name: "Name Your Hero",
};

const APPEARANCE_ROWS: {
  key: keyof CharacterAppearance;
  label: string;
  options: readonly string[];
}[] = [
  { key: "skin", label: "Skin", options: APPEARANCE_OPTIONS.skin },
  { key: "face", label: "Face", options: APPEARANCE_OPTIONS.face },
  { key: "hair", label: "Hair", options: APPEARANCE_OPTIONS.hair },
  { key: "hairColor", label: "Hair Color", options: APPEARANCE_OPTIONS.hairColor },
];

export function CharacterCreationWizard() {
  const draft = useGame((s) => s.creation);
  const setCreation = useGame((s) => s.setCreation);
  const setScreen = useGame((s) => s.setScreen);
  const hasExisting = useGame((s) => s.characters.length > 0);
  const logout = useGame((s) => s.logout);
  const [step, setStep] = useState<Step>("appearance");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const jobGridRef = useRef<HTMLDivElement>(null);
  const loginError = useGame((s) => s.loginError);

  useMenuPanelFocus(step);

  const mainJobIds = useMemo(() => ALL_JOBS.map((j) => j.id), []);
  const subJobIds = useMemo(
    () => ["", ...ALL_JOBS.filter((j) => j.id !== draft.mainJob).map((j) => j.id)],
    [draft.mainJob],
  );
  const jobIds = step === "main" ? mainJobIds : step === "sub" ? subJobIds : [];
  const jobLayout = useMemo(() => layoutJobGrid(jobIds, 4), [jobIds]);

  useEffect(() => {
    setFocusJobId(null);
  }, [step]);

  useEffect(() => {
    if (step !== "main" && step !== "sub") return;
    const onKey = (e: KeyboardEvent) => {
      const dir = treeNavDirection(e.key);
      if (!dir) return;
      if (!document.activeElement?.closest(".job-grid")) return;

      e.preventDefault();
      e.stopPropagation();

      if (!jobIds.length) return;

      const currentId = focusJobId ?? jobIds[0]!;
      const nextId = jobGridNeighbor(jobLayout, currentId, dir);
      if (nextId == null) return;
      setFocusJobId(nextId);
      requestAnimationFrame(() => {
        jobGridRef.current
          ?.querySelector<HTMLButtonElement>(`[data-job-id="${CSS.escape(nextId)}"]`)
          ?.focus();
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step, focusJobId, jobIds, jobLayout]);

  useEffect(() => {
    if (loginError) setBusy(false);
  }, [loginError]);

  const stepIndex = STEPS.indexOf(step);

  const next = () => {
    setError(null);
    if (step === "main" && !draft.mainJob) {
      setError("Select a main job.");
      return;
    }
    if (step === "sub" && draft.subJob && draft.subJob === draft.mainJob) {
      setError("Sub job must differ from main job.");
      return;
    }
    if (step === "name") {
      if (!draft.name.trim()) {
        setError("Enter a hero name.");
        return;
      }
      enterWorld();
      return;
    }
    setStep(STEPS[stepIndex + 1]);
  };

  const back = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  const enterWorld = () => {
    setBusy(true);
    setError(null);
    saveDraftAppearance(draft.appearance);
    net.enterWorld({
      player_name: draft.name.trim(),
      race: DEFAULT_RACE,
      main_job: draft.mainJob,
      sub_job: draft.subJob,
      appearance: appearanceToWire(draft.appearance),
    });
  };

  const patch = (partial: Partial<CreationDraft>) => {
    const next = { ...draft, ...partial, race: DEFAULT_RACE };
    setCreation(next);
    if (next.appearance) saveDraftAppearance(next.appearance);
  };

  const patchAppearance = (partial: Partial<CharacterAppearance>) => {
    const appearance = mergeAppearance(draft.appearance, partial);
    patch({ appearance });
  };

  return (
    <div className="login-screen">
      <div className="xiv-window login-panel creation-wizard">
        <div className="xiv-titlebar">
          <span className="xiv-title">Character Creation</span>
        </div>
        <div className="xiv-body">
          <div className="xiv-section-label">
            Step {stepIndex + 1} of {STEPS.length} — {STEP_LABELS[step]}
          </div>

          {step === "appearance" && (
            <div className="appearance-editor">
              <div className="appearance-preview-panel">
                <CharacterPreviewAnimated appearance={draft.appearance} hideWeapon />
                <p className="hint">Heroes 99 — AU_pixel</p>
              </div>
              <div className="appearance-options">
                {APPEARANCE_ROWS.map(({ key, label, options }) => {
                  const index = appearanceOptionIndex(options, draft.appearance[key]);
                  return (
                    <div key={key} className="appearance-row">
                      <div className="appearance-slider-header">
                        <span className="field-label">{label}</span>
                        <span className="appearance-slider-value">
                          {index} <span className="appearance-slider-max">/ {options.length}</span>
                        </span>
                      </div>
                      <input
                        type="range"
                        className="appearance-slider"
                        min={1}
                        max={options.length}
                        step={1}
                        value={index}
                        onChange={(e) =>
                          patchAppearance({
                            [key]: appearanceOptionAt(options, Number(e.target.value)),
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === "main" && (
            <div ref={jobGridRef} className="job-grid job-grid-compact">
              {ALL_JOBS.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  data-job-id={j.id}
                  aria-label={j.name}
                  className={`job-card job-card--inline ${draft.mainJob === j.id ? "selected" : ""}`}
                  onClick={() => {
                    setFocusJobId(j.id);
                    patch({ mainJob: j.id, subJob: draft.subJob === j.id ? "" : draft.subJob });
                  }}
                  onFocus={() => setFocusJobId(j.id)}
                >
                  <span className="job-swatch" style={{ background: j.color }} aria-hidden="true" />
                  <span className="job-name" aria-hidden="true">
                    {j.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === "sub" && (
            <>
              <p className="hint">Sub job abilities contribute at half strength (FFXI-style).</p>
              <div ref={jobGridRef} className="job-grid job-grid-compact">
                <button
                  type="button"
                  data-job-id=""
                  aria-label="None"
                  className={`job-card job-card--inline ${!draft.subJob ? "selected" : ""}`}
                  onClick={() => {
                    setFocusJobId("");
                    patch({ subJob: "" });
                  }}
                  onFocus={() => setFocusJobId("")}
                >
                  <span className="job-name" aria-hidden="true">
                    None
                  </span>
                </button>
                {ALL_JOBS.filter((j) => j.id !== draft.mainJob).map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    data-job-id={j.id}
                    aria-label={j.name}
                    className={`job-card job-card--inline ${draft.subJob === j.id ? "selected" : ""}`}
                    onClick={() => {
                      setFocusJobId(j.id);
                      patch({ subJob: j.id });
                    }}
                    onFocus={() => setFocusJobId(j.id)}
                  >
                    <span className="job-swatch" style={{ background: j.color }} aria-hidden="true" />
                    <span className="job-name" aria-hidden="true">
                      {j.name}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "name" && (
            <>
              <div className="appearance-editor appearance-editor--compact">
                <CharacterPreviewAnimated appearance={draft.appearance} hideWeapon />
                <div className="xiv-creation-summary">
                  <span>
                    {ALL_JOBS.find((j) => j.id === draft.mainJob)?.name ?? draft.mainJob}
                    {draft.subJob
                      ? ` / ${ALL_JOBS.find((j) => j.id === draft.subJob)?.name ?? draft.subJob}`
                      : ""}
                  </span>
                </div>
              </div>
              <label className="field-label">Hero Name</label>
              <input
                className="xiv-input"
                value={draft.name}
                maxLength={24}
                placeholder="1–24 characters"
                autoFocus
                onChange={(e) => patch({ name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && next()}
              />
            </>
          )}

          {error && <div className="error-text">{error}</div>}
          <div className="xiv-wizard-nav">
            {stepIndex === 0 && hasExisting ? (
              <button type="button" className="xiv-btn" aria-label="Back to Select" disabled={busy} onClick={() => setScreen("select")}>
                <span aria-hidden="true">Back to Select</span>
              </button>
            ) : (
              <button type="button" className="xiv-btn" aria-label="Back" disabled={stepIndex === 0 || busy} onClick={back}>
                <span aria-hidden="true">Back</span>
              </button>
            )}
            <button type="button" className="xiv-btn gold" aria-label={step === "name" ? (busy ? "Entering" : "Enter World") : "Next"} disabled={busy} onClick={next}>
              <span aria-hidden="true">{step === "name" ? (busy ? "Entering…" : "Enter World") : "Next"}</span>
            </button>
          </div>
          <button
            type="button"
            className="xiv-btn wide logout-btn"
            aria-label="Log Out"
            disabled={busy}
            onClick={() => {
              net.disconnect();
              logout();
            }}
          >
            <span aria-hidden="true">Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
