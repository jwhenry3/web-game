import { useEffect, useRef } from "react";
import {
  H99_ANIMS,
  H99_DISPLAY_SCALE,
  H99_LAYER_ORDER,
  H99_ORIGIN,
  appearanceKey,
  frameForAnim,
  layerAssetPath,
  type CharacterAnim,
  type CharacterAppearance,
} from "./heroes99";

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  imgs: HTMLImageElement[],
  anim: CharacterAnim,
  localFrame: number,
  w: number,
  h: number,
  fw: number,
  fh: number,
  ox: number,
  oy: number,
  margin: number,
): void {
  const sheetFrame = frameForAnim(anim, localFrame);
  const col = sheetFrame % 8;
  const row = Math.floor(sheetFrame / 8);
  const sx = col * 100;
  const sy = row * 40;
  const footX = w / 2;
  const footY = h - margin;
  const dx = footX - ox;
  const dy = footY - oy;

  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  for (const img of imgs) {
    ctx.drawImage(img, sx, sy, 100, 40, dx, dy, fw, fh);
  }
}

export function CharacterPreviewAnimated({
  appearance,
  className = "",
  hideWeapon = false,
  hideCloth = false,
  scale = 2,
}: {
  appearance: CharacterAppearance;
  className?: string;
  hideWeapon?: boolean;
  hideCloth?: boolean;
  scale?: number;
}) {
  const frameRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgsRef = useRef<HTMLImageElement[] | null>(null);
  const loadKeyRef = useRef("");

  const fw = 100 * H99_DISPLAY_SCALE * scale;
  const fh = 40 * H99_DISPLAY_SCALE * scale;
  const ox = fw * H99_ORIGIN.x;
  const oy = fh * H99_ORIGIN.y;
  const margin = 8;
  const w = Math.ceil(fw + margin * 2);
  const h = Math.ceil(fh + margin * 2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    let raf = 0;
    let last = 0;
    const { frames, msPerFrame } = H99_ANIMS.idle;
    const layers = H99_LAYER_ORDER.filter((layer) => {
      if (hideWeapon && (layer === "weapon_bot" || layer === "weapon_top")) return false;
      if (hideCloth && (layer === "cloth_bot" || layer === "cloth_top")) return false;
      return true;
    });
    const key = `${hideWeapon ? "nw:" : ""}${hideCloth ? "nc:" : ""}${appearanceKey(appearance)}`;

    const paint = () => {
      if (!imgsRef.current) return;
      drawFrame(ctx, imgsRef.current, "idle", frameRef.current, w, h, fw, fh, ox, oy, margin);
    };

    const load = async () => {
      if (loadKeyRef.current === key && imgsRef.current) {
        paint();
        return;
      }
      try {
        const paths = layers.map((layer) => layerAssetPath(layer, appearance));
        const imgs = await Promise.all(paths.map(loadImage));
        if (cancelled) return;
        imgsRef.current = imgs;
        loadKeyRef.current = key;
        paint();
      } catch (err) {
        console.warn("Character preview failed to load:", err);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#6a3030";
        ctx.font = "11px monospace";
        ctx.fillText("Preview unavailable", 8, h / 2);
      }
    };

    const tick = (t: number) => {
      if (t - last > msPerFrame) {
        frameRef.current = (frameRef.current + 1) % frames.length;
        last = t;
        paint();
      }
      raf = requestAnimationFrame(tick);
    };

    void load();
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [appearance, hideWeapon, hideCloth, w, h, fw, fh, ox, oy, margin]);

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      className={`character-preview character-preview--animated ${className}`.trim()}
      style={{ width: w, height: h }}
    />
  );
}
