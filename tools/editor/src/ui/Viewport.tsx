import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { slotLayer, type Doc, type Tool } from "../model/types";
import { animDuration, moveBoneWorld, poseAt } from "../model/rig";
import { variantKeyForLayer, type BoneTracks, type VariantSel } from "../model/types";
import { drawRig, pickAttachment, pickBone, toWorld, type View } from "../render/renderer";

interface UiState {
  selBone: string | null;
  selAnim: string;
  animTime: number;
  playing: boolean;
  selAtt: { slot: string; att: string } | null;
  tool: Tool;
  /** Base animation an additive clip previews on top of ("" = setup pose). */
  additiveBase: string;
}

interface Actions {
  setSpec: (fn: (s: Doc["spec"]) => Doc["spec"]) => void;
  setSelBone: (b: string | null) => void;
  setSelAtt: (a: { slot: string; att: string } | null) => void;
  setAnimTime: (t: number) => void;
}

export function Viewport({
  doc,
  sel,
  attForSlot,
  atlasCanvas,
  stateRef,
  actions,
  filtered,
}: {
  filtered: boolean;
  doc: Doc;
  sel: VariantSel;
  attForSlot: (slot: string) => string | undefined;
  atlasCanvas: React.RefObject<HTMLCanvasElement | null>;
  stateRef: React.RefObject<UiState>;
  actions: Actions;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filterHostRef = useRef<HTMLDivElement>(null);
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const viewRef = useRef<View>({ cx: 0, cy: 0, scale: 9 });
  const dragRef = useRef<
    | { kind: "pan"; x: number; y: number }
    | { kind: "bone"; name: string }
    | null
  >(null);
  const timeRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });
  const docRef = useRef(doc);
  docRef.current = doc;
  const selRef = useRef(sel);
  selRef.current = sel;

  // Feed the live edited composite to the same Phaser Glow filter used in
  // game. Guides never enter this texture, so only the character is outlined.
  useEffect(() => {
    if (!filtered) return;
    const host = filterHostRef.current!;
    class PreviewScene extends Phaser.Scene {
      private texture!: Phaser.Textures.CanvasTexture;
      private sprite!: Phaser.GameObjects.Image;
      private glow!: Phaser.Filters.Glow;
      create() {
        this.texture = this.textures.createCanvas("edited-character", 1, 1)!;
        this.sprite = this.add.image(0, 0, "edited-character").setOrigin(0);
        this.sprite.enableFilters();
        this.glow = this.sprite.filters!.internal.addGlow(0x2c1e36, 8, 0, 1, false, 8, 2);
      }
      update() {
        const source = canvasRef.current;
        if (!source || !source.width || !source.height) return;
        if (this.texture.width !== source.width || this.texture.height !== source.height) {
          this.scale.resize(source.width, source.height);
          this.texture.setSize(source.width, source.height);
          this.sprite.setSize(source.width, source.height);
        }
        this.texture.context.clearRect(0, 0, source.width, source.height);
        this.texture.context.drawImage(source, 0, 0);
        this.texture.refresh();
        // Runtime renders at two screen pixels per skeleton unit.
        this.glow.scale = viewRef.current.scale * (window.devicePixelRatio || 1) / 2;
        this.sprite.renderFilters = docRef.current.spec.output?.name !== "h99doll";
      }
    }
    const game = new Phaser.Game({
      type: Phaser.WEBGL, parent: host, width: 1, height: 1,
      transparent: true, pixelArt: true, audio: { noAudio: true },
      banner: false, scene: PreviewScene,
    });
    return () => { game.destroy(true); };
  }, [filtered]);

  /** Partial-pose overlays mirroring the runtime's guard tracks: guardB
   * applies when the selected sub weapon mounts on a weapon_over_* slot,
   * guardF when the main weapon mounts on weapon_front_* (shields). Their
   * tracks replace the base animation's for the bones they key. */
  const overlayRef = useRef<Record<string, BoneTracks> | null>(null);
  {
    const skin = doc.skeleton.skins[0]?.attachments ?? {};
    const merged: Record<string, BoneTracks> = {};
    for (const [layer, anim] of [["weapon_over", "guardB"], ["weapon_front", "guardF"]] as const) {
      const key = variantKeyForLayer(layer, sel);
      const mounted =
        key &&
        doc.skeleton.slots.some(
          (s) => slotLayer(doc.spec, s.name) === layer && skin[s.name]?.[key],
        );
      if (mounted) Object.assign(merged, doc.spec.animations[anim]?.bones ?? {});
    }
    overlayRef.current = Object.keys(merged).length ? merged : null;
  }

  /** Evaluate the preview pose. A clip flagged `additive` layers on top of
   * the chosen base animation (or setup pose); the base loops on its own
   * duration while the modifier drives the playhead. */
  const evalPose = (
    d: Doc,
    ui: UiState,
    t: number,
  ): ReturnType<typeof poseAt> => {
    const selData = ui.tool === "bones" ? null : d.spec.animations[ui.selAnim];
    let anim = selData?.bones ?? null;
    let additive: { tracks: Record<string, BoneTracks>; t: number } | null = null;
    if (selData?.additive) {
      additive = { tracks: selData.bones, t };
      const base = ui.additiveBase ? d.spec.animations[ui.additiveBase] : null;
      const baseDur = base ? animDuration(base.bones) : 0;
      anim = base?.bones ?? null;
      t = base && baseDur > 0 ? t % baseDur : t;
    }
    return poseAt(d.spec, anim, t, selRef.current.shape, overlayRef.current, additive);
  };

  // Init view once sized.
  useEffect(() => {
    const c = canvasRef.current!;
    viewRef.current = {
      cx: c.clientWidth / 2, cy: c.clientHeight * 0.72,
      scale: Math.min(9, c.clientWidth / 80, c.clientHeight / 55),
    };
    sizeRef.current = { w: c.clientWidth, h: c.clientHeight };
  }, []);

  // Render + playback loop.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const c = canvasRef.current;
      const d = docRef.current;
      const ui = stateRef.current!;
      if (c && d && atlasCanvas.current) {
        // Bones tool edits the setup pose; other tools preview the animation.
        const selData =
          ui.tool === "bones" ? null : d.spec.animations[ui.selAnim];
        const dur = selData ? Math.max(animDuration(selData.bones), 0.001) : 1;
        if (ui.playing) {
          timeRef.current = (timeRef.current + dt) % dur;
          actions.setAnimTime(timeRef.current);
        } else {
          timeRef.current = ui.animTime;
        }
        const t = ui.playing ? timeRef.current : Math.min(ui.animTime, dur);
        const pose = evalPose(d, ui, t);

        const dpr = window.devicePixelRatio || 1;
        const cw = c.clientWidth * dpr;
        const ch = c.clientHeight * dpr;
        if (c.width !== cw || c.height !== ch) {
          c.width = cw;
          c.height = ch;
        }
        // Keep the view anchored across resizes: shift the origin by half the
        // size delta so the centered world point stays centered.
        const v = viewRef.current;
        const dw = (c.clientWidth - sizeRef.current.w) / 2;
        const dh = (c.clientHeight - sizeRef.current.h) / 2;
        if (dw !== 0 || dh !== 0) {
          v.cx += dw;
          v.cy += dh;
          sizeRef.current = { w: c.clientWidth, h: c.clientHeight };
        }
        const ctx = c.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
        // ground line + feet origin marker (editing view only)
        if (!filteredRef.current) {
        const grid = v.scale * 8;
        ctx.strokeStyle = "#323232";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = ((v.cx % grid) + grid) % grid; x < c.clientWidth; x += grid) {
          ctx.moveTo(x, 0); ctx.lineTo(x, c.clientHeight);
        }
        for (let y = ((v.cy % grid) + grid) % grid; y < c.clientHeight; y += grid) {
          ctx.moveTo(0, y); ctx.lineTo(c.clientWidth, y);
        }
        ctx.stroke();
        ctx.strokeStyle = "#52604e";
        ctx.beginPath();
        ctx.moveTo(v.cx, 0); ctx.lineTo(v.cx, c.clientHeight);
        ctx.stroke();
        ctx.strokeStyle = "#68504d";
        ctx.beginPath();
        ctx.moveTo(0, v.cy);
        ctx.lineTo(c.clientWidth, v.cy);
        ctx.stroke();
        }
        drawRig(ctx, v, atlasCanvas.current, d.atlas, d.spec, d.skeleton, pose, {
          showBones: !filteredRef.current && (ui.tool !== "pixels" || !!ui.selAtt),
          selBone: ui.selBone,
          selAttachment: filteredRef.current ? null : ui.selAtt,
          attForSlot,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [atlasCanvas, attForSlot, stateRef, actions]);

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const [sx, sy] = pos(e);
    const ui = stateRef.current!;
    const d = docRef.current!;
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      dragRef.current = { kind: "pan", x: sx, y: sy };
      canvasRef.current!.setPointerCapture(e.pointerId);
      return;
    }
    if (filteredRef.current) return;
    const [wx, wy] = toWorld(viewRef.current, sx, sy);
    const pose = evalPose(d, ui, ui.animTime);
    if (ui.tool === "pixels") {
      actions.setSelAtt(pickAttachment(d.skeleton, pose, attForSlot, wx, wy));
      return;
    }
    const bone = pickBone(d.spec, pose, wx, wy, 8 / viewRef.current.scale);
    if (bone) {
      actions.setSelBone(bone);
      // Only the bones tool repositions; anim tool clicks select for track edits.
      if (ui.tool === "bones") {
        dragRef.current = { kind: "bone", name: bone };
        canvasRef.current!.setPointerCapture(e.pointerId);
      }
    } else {
      actions.setSelBone(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const [sx, sy] = pos(e);
    if (drag.kind === "pan") {
      viewRef.current.cx += sx - drag.x;
      viewRef.current.cy += sy - drag.y;
      dragRef.current = { kind: "pan", x: sx, y: sy };
      return;
    }
    const [wx, wy] = toWorld(viewRef.current, sx, sy);
    actions.setSpec((s) => moveBoneWorld(s, drag.name, wx, wy));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const [sx, sy] = pos(e as unknown as React.PointerEvent);
    const v = viewRef.current;
    const [wx, wy] = toWorld(v, sx, sy);
    v.scale = Math.min(40, Math.max(2, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    v.cx = sx - wx * v.scale;
    v.cy = sy + wy * v.scale;
  };

  return (
    <div className="ed-viewport">
      <canvas
        style={{ opacity: filtered ? 0 : 1 }}
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div ref={filterHostRef} className="ed-filter-preview" />
    </div>
  );
}
