import { useState, useEffect } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { saveOptions } from "../state/optionsStorage";
import { HoverTooltip } from "../ui/HoverTooltip";
import {
  KEYBIND_SECTIONS,
  actionLabel,
  bindingToDisplay,
  captureNextKey,
  defaultKeybinds,
  keybindOverrides,
  mergeKeybinds,
  notifyKeybindCapture,
  type KeybindMap,
} from "../input/keybinds";

export function MainMenuTrigger() {
  const toggle = useGame((s) => s.toggleMainMenu);
  const open = useGame((s) => s.mainMenuOpen);

  return (
    <HoverTooltip content="Main Menu [Esc]">
      <button
        type="button"
        className={`xiv-menu-btn ${open ? "on" : ""}`}
        onClick={toggle}
        aria-label="Main Menu"
      >
        <span className="xiv-menu-icon xiv-menu-icon--glyph">☰</span>
      </button>
    </HoverTooltip>
  );
}

function MenuButton({
  label,
  hint,
  onClick,
  variant = "default",
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  variant?: "default" | "danger" | "gold";
}) {
  return (
    <button
      type="button"
      className={`main-menu-btn ${variant !== "default" ? variant : ""}`}
      onClick={onClick}
    >
      <span className="main-menu-btn-label">{label}</span>
      {hint && <span className="main-menu-btn-hint">{hint}</span>}
    </button>
  );
}

function KeybindsContent() {
  const profile = useGame((s) => s.profile);
  const [draft, setDraft] = useState<KeybindMap>(() => mergeKeybinds(profile?.keybinds));
  const [listening, setListening] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setDraft(mergeKeybinds(profile?.keybinds));
  }, [profile?.keybinds]);

  useEffect(() => {
    if (!listening) return;
    const cancel = captureNextKey((binding) => {
      setDraft((prev) => {
        const next = { ...prev, [listening]: binding };
        net.setKeybinds(keybindOverrides(next));
        return next;
      });
      setListening(null);
      setStatus(`Bound ${actionLabel(listening)} to ${bindingToDisplay(binding)}`);
    });
    const onKey = (e: KeyboardEvent) => {
      if (notifyKeybindCapture(e)) {
        if (e.key === "Escape") setListening(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancel();
      window.removeEventListener("keydown", onKey, true);
    };
  }, [listening]);

  const resetDefaults = () => {
    const defaults = defaultKeybinds();
    setDraft(defaults);
    net.setKeybinds({});
    setStatus("Restored default key bindings.");
  };

  return (
    <>
      <p className="hint main-menu-keybind-hint">Click a binding, then press the new key. Esc cancels capture.</p>
      <div className="main-menu-keybinds">
        {KEYBIND_SECTIONS.map((section) => (
          <section key={section.title} className="main-menu-keybind-section">
            <h3 className="xiv-section-label">{section.title}</h3>
            {section.actions.map((action) => (
              <div key={action} className="main-menu-keybind-row">
                <span className="main-menu-keybind-action">{actionLabel(action)}</span>
                <button
                  type="button"
                  className={`xiv-btn ${listening === action ? "gold on" : ""}`}
                  onClick={() => {
                    setListening(action);
                    setStatus(`Press a key for ${actionLabel(action)}…`);
                  }}
                >
                  {listening === action ? "…" : bindingToDisplay(draft[action] ?? "")}
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
      {status && <p className="hint">{status}</p>}
      <div className="main-menu-actions">
        <button type="button" className="xiv-btn" onClick={resetDefaults}>
          Reset Defaults
        </button>
      </div>
    </>
  );
}

type OptionsTab = "video" | "audio" | "controls" | "general";

const OPTIONS_TABS: { id: OptionsTab; label: string }[] = [
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "controls", label: "Controls" },
  { id: "general", label: "General" },
];

function OptionsPanel() {
  const options = useGame((s) => s.options);
  const setOptions = useGame((s) => s.setOptions);
  const [tab, setTab] = useState<OptionsTab>("audio");

  const patch = (partial: Partial<typeof options>) => {
    const next = { ...options, ...partial };
    setOptions(next);
    saveOptions(next);
  };

  return (
    <>
      <div className="main-menu-options-layout">
        <nav className="main-menu-options-nav" aria-label="Options categories">
          {OPTIONS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`main-menu-options-tab ${tab === t.id ? "on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="main-menu-options-content">
          {tab === "video" && (
            <div className="main-menu-options">
              <p className="hint">Display settings will appear here.</p>
            </div>
          )}
          {tab === "audio" && (
            <div className="main-menu-options">
              <label className="main-menu-option">
                <span className="main-menu-option-label">Music Volume</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={options.musicVolume}
                  onChange={(e) => patch({ musicVolume: Number(e.target.value) })}
                />
                <span className="main-menu-option-value">{options.musicVolume}%</span>
              </label>
              <label className="main-menu-option">
                <span className="main-menu-option-label">SFX Volume</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={options.sfxVolume}
                  onChange={(e) => patch({ sfxVolume: Number(e.target.value) })}
                />
                <span className="main-menu-option-value">{options.sfxVolume}%</span>
              </label>
            </div>
          )}
          {tab === "controls" && <KeybindsContent />}
          {tab === "general" && (
            <div className="main-menu-options">
              <label className="main-menu-option main-menu-option--check">
                <input
                  type="checkbox"
                  checked={options.confirmLogout}
                  onChange={(e) => patch({ confirmLogout: e.target.checked })}
                />
                <span>Confirm before logout</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MenuPanel() {
  const closeMainMenu = useGame((s) => s.closeMainMenu);
  const setMainMenuView = useGame((s) => s.setMainMenuView);
  const logout = useGame((s) => s.logout);
  const options = useGame((s) => s.options);
  const username = useGame((s) => s.username);
  const profile = useGame((s) => s.profile);
  const [confirming, setConfirming] = useState(false);

  const doLogout = () => {
    closeMainMenu();
    net.disconnect();
    logout();
  };

  const onLogout = () => {
    if (options.confirmLogout && !confirming) {
      setConfirming(true);
      return;
    }
    doLogout();
  };

  return (
    <>
      <div className="main-menu-account">
        {username && <div className="dim">Account · {username}</div>}
        {profile && (
          <div>
            {profile.name} · Lv {profile.level} {profile.main_job}
            {profile.sub_job ? ` / ${profile.sub_job}` : ""}
          </div>
        )}
      </div>
      <div className="main-menu-list">
        <MenuButton label="Resume Game" hint="Return to the world" onClick={closeMainMenu} variant="gold" />
        <MenuButton label="Options" hint="Video, audio & controls" onClick={() => setMainMenuView("options")} />
        {!confirming ? (
          <MenuButton label="Logout" hint="Return to title screen" onClick={onLogout} variant="danger" />
        ) : (
          <>
            <p className="main-menu-confirm">Logout and return to the title screen?</p>
            <div className="main-menu-confirm-btns">
              <button type="button" className="xiv-btn danger" onClick={doLogout}>
                Yes, Logout
              </button>
              <button type="button" className="xiv-btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
      <p className="hint main-menu-hint">Esc close · Space confirm · Enter chat</p>
    </>
  );
}

export function MainMenu() {
  const open = useGame((s) => s.mainMenuOpen);
  const view = useGame((s) => s.mainMenuView);
  const closeMainMenu = useGame((s) => s.closeMainMenu);

  if (!open) return null;

  const title = view === "options" ? "Options" : "Main Menu";

  return (
    <div className="main-menu-backdrop" onClick={closeMainMenu}>
      <div
        className={`xiv-window main-menu-panel ${view === "options" ? "main-menu-panel--options" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="xiv-titlebar">
          <span className="xiv-title">{title}</span>
          <button type="button" className="xiv-close" onClick={closeMainMenu} aria-label="Close">
            ×
          </button>
        </div>
        <div className="xiv-body">
          {view === "options" ? <OptionsPanel /> : <MenuPanel />}
        </div>
      </div>
    </div>
  );
}
