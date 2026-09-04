import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import { CAMP_SKINS } from "../housing/campSkins";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { HoverTooltip } from "../ui/HoverTooltip";
import {
  clearHousePlace,
  getHousePlaceState,
  setHousePickMode,
  subscribeHousePlace,
} from "../world/housePlaceBridge";
import {
  getHouseSkinPickerOpen,
  setHouseSkinPickerOpen,
  subscribeHouseSkinPicker,
} from "../world/houseSkinBridge";

function useHousePlace() {
  return useSyncExternalStore(subscribeHousePlace, getHousePlaceState, getHousePlaceState);
}

function useSkinPickerOpen() {
  return useSyncExternalStore(subscribeHouseSkinPicker, getHouseSkinPickerOpen, getHouseSkinPickerOpen);
}

function swatchStyle(hex: number): CSSProperties {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return {
    background: `linear-gradient(135deg, rgb(${r},${g},${b}) 40%, rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)}) 100%)`,
  };
}

/** Bottom chrome in the house: storage / pick / skin / leave tools. */
export function HouseToolbar() {
  const house = useGame((s) => s.house);
  const profile = useGame((s) => s.profile);
  const openWindow = useGame((s) => s.openWindow);
  const toggleWindow = useGame((s) => s.toggleWindow);
  const place = useHousePlace();
  const skinOpen = useSkinPickerOpen();

  useEffect(() => {
    return () => {
      clearHousePlace();
      setHouseSkinPickerOpen(false);
    };
  }, []);

  useEffect(() => {
    if (!house?.is_owner) setHouseSkinPickerOpen(false);
  }, [house?.is_owner]);

  if (!house || !profile) return null;

  const isOwner = house.is_owner;
  const currentSkin = (house.skin || profile.camp_skin || "basic").toLowerCase();

  return (
    <div
      className="hotbar house-toolbar"
      onKeyDown={(e) => {
        if (e.key.startsWith("Arrow")) e.preventDefault();
      }}
    >
      {isOwner && skinOpen && (
        <div className="house-skin-picker" role="dialog" aria-label="Tent skin">
          <div className="house-skin-picker-title">Tent skin</div>
          <div className="house-skin-picker-grid">
            {CAMP_SKINS.map((skin) => {
              const selected = skin.id === currentSkin;
              return (
                <button
                  key={skin.id}
                  type="button"
                  className={`house-skin-swatch ${selected ? "selected" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (selected) return;
                    net.setCampSkin(skin.id);
                  }}
                >
                  <span className="house-skin-swatch-chip" style={swatchStyle(skin.outer)} aria-hidden />
                  <span className="house-skin-swatch-name">{skin.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="hotbar-row house-toolbar-tools">
        <HoverTooltip content="Open house storage [1]">
          <button
            type="button"
            tabIndex={-1}
            className={`hotbar-slot house-tool ${openWindow === "house_storage" ? "selected" : ""} ${!isOwner ? "is-locked" : ""}`}
            disabled={!isOwner}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!isOwner) return;
              clearHousePlace();
              setHouseSkinPickerOpen(false);
              toggleWindow("house_storage");
            }}
          >
            <span className="hotbar-key">1</span>
            <span className="house-tool-glyph" aria-hidden>
              ▣
            </span>
            <span className="hotbar-label">Storage</span>
          </button>
        </HoverTooltip>

        <HoverTooltip content={isOwner ? "Pick up furniture [2]" : "Owner only"}>
          <button
            type="button"
            tabIndex={-1}
            className={`hotbar-slot house-tool ${place.pickMode ? "selected" : ""} ${!isOwner ? "is-locked" : ""}`}
            disabled={!isOwner}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!isOwner) return;
              setHouseSkinPickerOpen(false);
              setHousePickMode(!place.pickMode);
            }}
          >
            <span className="hotbar-key">2</span>
            <span className="house-tool-glyph" aria-hidden>
              ⇧
            </span>
            <span className="hotbar-label">Pick</span>
          </button>
        </HoverTooltip>

        <HoverTooltip content="Cancel pick mode [3]">
          <button
            type="button"
            tabIndex={-1}
            className={`hotbar-slot house-tool ${!place.pickMode ? "is-locked" : ""}`}
            disabled={!place.pickMode}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => clearHousePlace()}
          >
            <span className="hotbar-key">3</span>
            <span className="house-tool-glyph" aria-hidden>
              ✕
            </span>
            <span className="hotbar-label">Clear</span>
          </button>
        </HoverTooltip>

        <HoverTooltip content={isOwner ? "Change tent skin [4]" : "Owner only"}>
          <button
            type="button"
            tabIndex={-1}
            className={`hotbar-slot house-tool ${skinOpen ? "selected" : ""} ${!isOwner ? "is-locked" : ""}`}
            disabled={!isOwner}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!isOwner) return;
              clearHousePlace();
              setHouseSkinPickerOpen(!skinOpen);
            }}
          >
            <span className="hotbar-key">4</span>
            <span className="house-tool-glyph" aria-hidden>
              ▲
            </span>
            <span className="hotbar-label">Skin</span>
          </button>
        </HoverTooltip>

        <HoverTooltip content="Leave house [5]">
          <button
            type="button"
            tabIndex={-1}
            className="hotbar-slot house-tool"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              clearHousePlace();
              setHouseSkinPickerOpen(false);
              net.leaveHouse();
            }}
          >
            <span className="hotbar-key">5</span>
            <span className="house-tool-glyph" aria-hidden>
              ⌂
            </span>
            <span className="hotbar-label">Leave</span>
          </button>
        </HoverTooltip>
      </div>

      {isOwner && place.pickMode && <div className="house-toolbar-hint">Pick mode — click furniture to pick up</div>}
      {isOwner && !place.pickMode && !skinOpen && (
        <div className="house-toolbar-hint">Drag furniture from Inventory onto the floor to place</div>
      )}
      {isOwner && skinOpen && (
        <div className="house-toolbar-hint">Choose a tent look — changes the overworld camp graphic</div>
      )}
    </div>
  );
}
