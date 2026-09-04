import { useEffect, useRef, useState } from "react";
import type { AdminMapInfo } from "../net/adminMaps";
import { colorForGid, TERRAIN_COLORS } from "../editor/tilePalette";
import type { ImportedTileset } from "../editor/tilesetConfig";

interface Props {
  maps: AdminMapInfo[];
  destMapId: string;
  destX: number;
  destY: number;
  tileset: ImportedTileset | null;
  onPick: (mapId: string, x: number, y: number) => void;
}

export function TransitionDestPicker({ maps, destMapId, destX, destY, tileset, onPick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mapInfo, setMapInfo] = useState<AdminMapInfo | null>(null);

  useEffect(() => {
    setMapInfo(maps.find((m) => m.id === destMapId) ?? null);
  }, [destMapId, maps]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapInfo?.terrain_layers) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cols = mapInfo.cols;
    const rows = mapInfo.rows;
    const tileSize = mapInfo.tile_size || 32;
    const scale = Math.min(280 / (cols * tileSize), 160 / (rows * tileSize), 1);
    const px = tileSize * scale;
    canvas.width = cols * px;
    canvas.height = rows * px;

    const ground = mapInfo.terrain_layers.ground;
    const collision = mapInfo.terrain_layers.collision;

    ctx.fillStyle = "#14141a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const gid = ground[i] & 0x1fffffff;
        ctx.fillStyle = colorForGid(gid, tileset);
        ctx.fillRect(c * px, r * px, px, px);
        if (collision[i]) {
          ctx.fillStyle = TERRAIN_COLORS.collision;
          ctx.fillRect(c * px, r * px, px, px);
        }
      }
    }

    const mx = destX * scale;
    const my = destY * scale;
    ctx.strokeStyle = "#f5d76e";
    ctx.fillStyle = "rgba(245, 215, 110, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, Math.max(4, px * 0.35), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, [mapInfo, destX, destY, tileset]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mapInfo) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;
    const tileSize = mapInfo.tile_size || 32;
    const mapScale = canvas.width / (mapInfo.cols * tileSize);
    const wx = x / mapScale;
    const wy = y / mapScale;
    const tcx = Math.floor(wx / tileSize) * tileSize + tileSize / 2;
    const tcy = Math.floor(wy / tileSize) * tileSize + tileSize / 2;
    onPick(destMapId, tcx, tcy);
  };

  if (!destMapId) {
    return <p className="dim map-editor-dest-hint">Select a destination map to preview spawn position.</p>;
  }

  return (
    <div className="map-editor-dest-picker">
      <div className="map-editor-dest-picker-header">
        <span>{mapInfo?.name ?? destMapId}</span>
        <span className="dim">
          ({Math.round(destX)}, {Math.round(destY)})
        </span>
      </div>
      <canvas ref={canvasRef} className="map-editor-dest-canvas" onClick={handleClick} />
      <p className="dim map-editor-dest-hint">Click the map to set where players arrive.</p>
    </div>
  );
}
