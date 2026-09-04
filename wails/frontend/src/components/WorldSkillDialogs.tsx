import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import type { VisitedSavePoint } from "../types";
import { WorldMap, loadAtlasIfNeeded } from "./WorldMap";
import { markersForMap } from "../world/mapMarkers";

function groupVisitedByMap(visited: VisitedSavePoint[], currentMap?: string) {
  const groups = new Map<string, VisitedSavePoint[]>();
  for (const sp of visited) {
    const key = sp.map_name?.trim() || "Unknown";
    const list = groups.get(key) ?? [];
    list.push(sp);
    groups.set(key, list);
  }
  const names = [...groups.keys()];
  names.sort((a, b) => {
    if (currentMap && a === currentMap) return -1;
    if (currentMap && b === currentMap) return 1;
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    return a.localeCompare(b);
  });
  return names.map((name) => ({ name, points: groups.get(name)! }));
}

function TeleportDialog({
  visited,
  onClose,
}: {
  visited: VisitedSavePoint[];
  onClose: () => void;
}) {
  const atlas = useGame((s) => s.atlas);
  const mapInfo = useGame((s) => s.mapInfo);
  const visitedIds = new Set(visited.map((v) => v.id));
  const maps = atlas.filter((m) => m.pois.some((p) => visitedIds.has(p.id)));
  const preferred = maps.some((m) => m.id === mapInfo?.id) ? mapInfo!.id : maps[0]?.id ?? "";
  const [mapId, setMapId] = useState(preferred);
  const [picked, setPicked] = useState<string | null>(visited.find((v) => v.home)?.id ?? null);

  useEffect(() => {
    loadAtlasIfNeeded();
  }, []);

  useEffect(() => {
    if (preferred) setMapId(preferred);
  }, [preferred]);

  const selectedId = maps.some((m) => m.id === mapId) ? mapId : preferred;
  const current = maps.find((m) => m.id === selectedId);
  const markers = current
    ? markersForMap({
        atlas: current,
        visited,
        selectableVisited: true,
      })
    : [];

  const clearPicked = () => setPicked(null);

  const handleSelectMap = (id: string) => {
    clearPicked();
    setMapId(id);
  };

  const focusSavePoint = (sp: VisitedSavePoint) => {
    const mapForSp = maps.find((m) => m.pois.some((p) => p.id === sp.id));
    if (mapForSp) setMapId(mapForSp.id);
    setPicked(sp.id);
  };

  const confirmSavePoint = (sp: VisitedSavePoint) => {
    useGame.getState().openTeleportConfirm({
      id: sp.id,
      name: sp.name,
    });
  };

  const handleListClick = (sp: VisitedSavePoint) => {
    if (picked === sp.id) {
      confirmSavePoint(sp);
      return;
    }
    focusSavePoint(sp);
  };

  const handleMapSelect = (id: string) => {
    if (picked === id) {
      const sp = visited.find((v) => v.id === id);
      const marker = markers.find((m) => m.id === id);
      useGame.getState().openTeleportConfirm({
        id,
        name: sp?.name ?? marker?.name ?? "this crystal",
      });
      return;
    }
    setPicked(id);
  };

  return (
    <div className="xiv-panel xiv-skill-dialog xiv-skill-dialog--teleport" onPointerDown={(e) => e.stopPropagation()}>
      <div className="xiv-panel-head">Teleport</div>
      {visited.length === 0 ? (
        <p className="hint">Attune to a save crystal first. Click a crystal in the world to remember it.</p>
      ) : (
        <>
          <p className="hint">Select a crystal from the list or map, then click again to teleport. Drag the map to pan.</p>
          <div className="xiv-teleport-layout">
            <div className="xiv-teleport-list">
              {groupVisitedByMap(visited, mapInfo?.name).map((group) => (
                <section key={group.name} className="xiv-teleport-section">
                  <h3 className="xiv-section-label">{group.name}</h3>
                  {group.points.map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      className={`xiv-btn ${sp.home ? "gold" : ""} ${picked === sp.id ? "on" : ""}`}
                      onClick={() => handleListClick(sp)}
                    >
                      {sp.name}
                      {sp.home ? " (home)" : ""}
                    </button>
                  ))}
                </section>
              ))}
            </div>
            {maps.length > 0 && (
              <WorldMap
                maps={maps}
                selectedMapId={selectedId}
                onSelectMap={handleSelectMap}
                onResetSelection={clearPicked}
                markers={markers}
                selectedMarkerId={picked}
                onSelectMarker={handleMapSelect}
              />
            )}
          </div>
        </>
      )}
      <button type="button" className="xiv-btn" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

export function WorldSkillDialogs() {
  const profile = useGame((s) => s.profile);
  const dialog = useGame((s) => s.worldSkillDialog);
  const confirm = useGame((s) => s.teleportConfirm);
  const close = useGame((s) => s.closeWorldSkillDialog);
  const closeConfirm = useGame((s) => s.closeTeleportConfirm);
  const ignoreUntil = useRef(0);
  const confirmIgnore = useRef(0);

  useEffect(() => {
    if (!confirm) return;
    confirmIgnore.current = performance.now() + 280;
  }, [confirm]);

  useEffect(() => {
    if (!dialog) return;
    ignoreUntil.current = performance.now() + 400;
  }, [dialog]);

  if (!dialog && !confirm) return null;

  const homeName = profile?.save_point_name || "your save crystal";
  const hasHome = !!profile?.save_point_id;
  const visited = profile?.visited_save_points ?? [];

  const dismissBackdrop = () => {
    if (performance.now() < ignoreUntil.current) return;
    close();
  };

  const body =
    dialog === "return" ? (
      <div className="xiv-panel xiv-skill-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="xiv-panel-head">Return</div>
        {hasHome ? (
          <p className="hint">
            Warp back to <strong>{homeName}</strong>?
          </p>
        ) : (
          <p className="hint">Set a save crystal first. Click a crystal in the world to attune and set it as home.</p>
        )}
        <div className="xiv-social-invite-btns">
          {hasHome && (
            <button type="button" className="xiv-btn gold" onClick={() => net.useWorldSkill("return")}>
              Return
            </button>
          )}
          <button type="button" className="xiv-btn" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    ) : dialog === "teleport" ? (
      <TeleportDialog visited={visited} onClose={close} />
    ) : null;

  return createPortal(
    <>
      {dialog && body && (
        <div className="xiv-skill-dialog-layer" onPointerDown={dismissBackdrop}>
          {body}
        </div>
      )}
      {confirm && (
        <div
          className="xiv-skill-dialog-layer xiv-skill-dialog-layer--confirm"
          onPointerDown={() => {
            if (performance.now() < confirmIgnore.current) return;
            closeConfirm();
          }}
        >
          <div className="xiv-panel xiv-skill-dialog" onPointerDown={(e) => e.stopPropagation()}>
            <div className="xiv-panel-head">Teleport</div>
            <p className="hint">
              Warp to <strong>{confirm.name}</strong>?
            </p>
            <div className="xiv-social-invite-btns">
              <button
                type="button"
                className="xiv-btn gold"
                onClick={() => {
                  net.useWorldSkill("teleport", confirm.id);
                  useGame.getState().closeWindow();
                }}
              >
                Teleport
              </button>
              <button type="button" className="xiv-btn" onClick={closeConfirm}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
