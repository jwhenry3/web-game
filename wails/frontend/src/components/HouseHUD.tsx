import type { CSSProperties } from "react";
import { useGame } from "../state/store";

/** Thin chrome over HouseScene — title only; tools live on the house hotbar. */
export function HouseHUD() {
  const house = useGame((s) => s.house);

  if (!house) return null;

  return (
    <div className="house-hud" style={hudStyle}>
      <div style={topBar}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <strong>{house.owner_name}&apos;s House</strong>
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            Walk to the door to leave · chest for storage
          </span>
        </div>
      </div>
    </div>
  );
}

const hudStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 12,
  color: "#e8eef4",
  zIndex: 5,
};

const topBar: CSSProperties = {
  pointerEvents: "none",
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  justifyContent: "flex-start",
  background: "linear-gradient(180deg, rgba(12,18,24,0.75), rgba(12,18,24,0))",
  margin: -12,
  marginBottom: 0,
  padding: "12px 12px 28px",
};
