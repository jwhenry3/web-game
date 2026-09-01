import { useState } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { saveOptions } from "../state/optionsStorage";
import { HoverTooltip } from "../ui/HoverTooltip";

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

function OptionsPanel() {
  const options = useGame((s) => s.options);
  const setOptions = useGame((s) => s.setOptions);
  const setMainMenuView = useGame((s) => s.setMainMenuView);

  const patch = (partial: Partial<typeof options>) => {
    const next = { ...options, ...partial };
    setOptions(next);
    saveOptions(next);
  };

  return (
    <>
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
        <label className="main-menu-option main-menu-option--check">
          <input
            type="checkbox"
            checked={options.confirmLogout}
            onChange={(e) => patch({ confirmLogout: e.target.checked })}
          />
          <span>Confirm before logout</span>
        </label>
      </div>
      <div className="main-menu-actions">
        <button type="button" className="xiv-btn" onClick={() => setMainMenuView("menu")}>
          Back
        </button>
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
        <MenuButton label="Options" hint="Audio & preferences" onClick={() => setMainMenuView("options")} />
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
      <p className="hint main-menu-hint">Press Esc to close · Windows: C E I K O</p>
    </>
  );
}

export function MainMenu() {
  const open = useGame((s) => s.mainMenuOpen);
  const view = useGame((s) => s.mainMenuView);
  const closeMainMenu = useGame((s) => s.closeMainMenu);

  if (!open) return null;

  return (
    <div className="main-menu-backdrop" onClick={closeMainMenu}>
      <div className="xiv-window main-menu-panel" onClick={(e) => e.stopPropagation()}>
        <div className="xiv-titlebar">
          <span className="xiv-title">{view === "options" ? "Options" : "Main Menu"}</span>
          <button type="button" className="xiv-close" onClick={closeMainMenu} aria-label="Close">
            ×
          </button>
        </div>
        <div className="xiv-body">{view === "options" ? <OptionsPanel /> : <MenuPanel />}</div>
      </div>
    </div>
  );
}
