import { useEffect, useState } from "react";
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
import { JobSelectionSteps } from "./JobSelectionSteps";

const DEFAULT_RACE = "hume";

const STEPS = ["appearance", "main", "name"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  appearance: "Customize Appearance",
  main: "Choose Main Job",
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
  const loginError = useGame((s) => s.loginError);

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
            <JobSelectionSteps
              step="main"
              mainJob={draft.mainJob}
              subJob=""
              startersOnly
              onMainJob={(id) => patch({ mainJob: id, subJob: "" })}
              onSubJob={() => {}}
            />
          )}

          {step === "name" && (
            <>
              <div className="appearance-editor appearance-editor--compact">
                <CharacterPreviewAnimated appearance={draft.appearance} hideWeapon />
                <div className="xiv-creation-summary">
                  <span>{ALL_JOBS.find((j) => j.id === draft.mainJob)?.name ?? draft.mainJob}</span>
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
              <button type="button" className="xiv-btn" disabled={busy} onClick={() => setScreen("select")}>
                Back to Select
              </button>
            ) : (
              <button type="button" className="xiv-btn" disabled={stepIndex === 0 || busy} onClick={back}>
                Back
              </button>
            )}
            <button type="button" className="xiv-btn gold" disabled={busy} onClick={next}>
              {step === "name" ? (busy ? "Entering…" : "Enter World") : "Next"}
            </button>
          </div>
          <button
            type="button"
            className="xiv-btn wide logout-btn"
            disabled={busy}
            onClick={() => {
              net.disconnect();
              logout();
            }}
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
