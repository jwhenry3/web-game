import { useState } from "react";
import type { Doc } from "../App";
import { animDuration, sampleRot, sampleTrans } from "../model/rig";
import type { BoneTracks, RotKey, Spec, SpineAnim, TransKey } from "../model/types";

interface Actions {
  setSpec: (fn: (s: Spec) => Spec) => void;
  setSelAnim: (a: string) => void;
  setAnimTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setSelBone: (b: string | null) => void;
  setAdditiveBase: (a: string) => void;
}

type KeyRef = { bone: string; kind: "rotate" | "translate"; idx: number } | null;

/** Track label column width; lanes start right of it. */
const LABEL_W = 176;

export function AnimPanel({
  doc,
  selAnim,
  animTime,
  playing,
  selBone,
  additiveBase,
  actions,
}: {
  doc: Doc;
  selAnim: string;
  animTime: number;
  playing: boolean;
  selBone: string | null;
  additiveBase: string;
  actions: Actions;
}) {
  const [selKey, setSelKey] = useState<KeyRef>(null);
  const [newAnim, setNewAnim] = useState("");
  const [newTrackBone, setNewTrackBone] = useState("");
  const [pxPerSec, setPxPerSec] = useState(160);
  const anim = doc.spec.animations[selAnim];
  const dur = anim ? animDuration(anim.bones) : 0;
  // Half-second runway past the last key so keys can drag the clip longer.
  const tlDur = Math.max(dur + 0.5, 1);
  const tlW = tlDur * pxPerSec;

  const setAnim = (fn: (a: SpineAnim) => SpineAnim) =>
    actions.setSpec((s) => ({
      ...s,
      animations: { ...s.animations, [selAnim]: fn(s.animations[selAnim]!) },
    }));

  const setKeys = (bone: string, kind: "rotate" | "translate", keys: RotKey[] | TransKey[]) =>
    setAnim((a) => {
      const prev = a.bones[bone] ?? {};
      const next =
        kind === "rotate"
          ? { ...prev, rotate: keys as RotKey[] }
          : { ...prev, translate: keys as TransKey[] };
      return { ...a, bones: { ...a.bones, [bone]: next } };
    });

  const sorted = <T extends { time: number }>(keys: T[]): T[] =>
    [...keys].sort((a, b) => a.time - b.time);

  const addKey = (bone: string, kind: "rotate" | "translate") => {
    const tracks = anim?.bones[bone];
    if (kind === "rotate") {
      const keys = sorted(tracks?.rotate ?? []);
      keys.push({ time: animTime, value: sampleRot(tracks?.rotate, animTime) });
      setKeys(bone, "rotate", sorted(keys));
    } else {
      const keys = sorted(tracks?.translate ?? []);
      const v = sampleTrans(tracks?.translate, animTime);
      keys.push({ time: animTime, x: v.x, y: v.y });
      setKeys(bone, "translate", sorted(keys));
    }
  };

  const removeKey = (bone: string, kind: "rotate" | "translate", idx: number) => {
    const keys = [...(anim?.bones[bone]?.[kind] ?? [])];
    keys.splice(idx, 1);
    setKeys(bone, kind, keys as RotKey[] & TransKey[]);
    setSelKey(null);
  };

  const editKey = (
    bone: string,
    kind: "rotate" | "translate",
    idx: number,
    patch: Partial<RotKey> | Partial<TransKey>,
  ) => {
    const keys = [...(anim?.bones[bone]?.[kind] ?? [])] as (RotKey | TransKey)[];
    const keyObj = { ...keys[idx]!, ...patch };
    keys[idx] = keyObj;
    const next = sorted(keys);
    setKeys(bone, kind, next as RotKey[] & TransKey[]);
    // Sorting can move the edited key — keep the selection on it and return
    // the new index so a key drag keeps following the same key.
    const nextIdx = next.indexOf(keyObj);
    if (selKey?.bone === bone && selKey.kind === kind && selKey.idx === idx) {
      setSelKey({ bone, kind, idx: nextIdx });
    }
    return nextIdx;
  };

  const addAnimation = () => {
    const name = newAnim.trim();
    if (!name || doc.spec.animations[name]) return;
    actions.setSpec((s) => ({
      ...s,
      animations: { ...s.animations, [name]: { bones: {} } },
    }));
    actions.setSelAnim(name);
    setNewAnim("");
  };

  const cloneAnimation = () => {
    const name = `${selAnim}_copy`;
    actions.setSpec((s) => ({
      ...s,
      animations: {
        ...s.animations,
        [name]: JSON.parse(JSON.stringify(s.animations[selAnim])),
      },
    }));
    actions.setSelAnim(name);
  };

  const deleteAnimation = () => {
    if (!confirm(`Delete animation "${selAnim}"?`)) return;
    actions.setSpec((s) => {
      const anims = { ...s.animations };
      delete anims[selAnim];
      return { ...s, animations: anims };
    });
    actions.setSelAnim("idle");
    setSelKey(null);
  };

  const toggleAdditive = (on: boolean) =>
    setAnim((a) => {
      const next = { ...a };
      if (on) next.additive = true;
      else delete next.additive;
      return next;
    });

  const selKeyData = (() => {
    if (!selKey || !anim) return null;
    const keys = anim.bones[selKey.bone]?.[selKey.kind];
    const k = keys?.[selKey.idx];
    return k ? { key: k, keys: keys! } : null;
  })();

  return (
    <div className="ed-animdock">
      <div className="ed-dock-title">
        <span className="ed-scene-tab">Timeline</span>
        <span>{anim ? selAnim : "No animation"}</span>
      </div>
      <div className="ed-animdock-tools">
        <select value={selAnim} onChange={(e) => { actions.setSelAnim(e.target.value); setSelKey(null); }}>
          {Object.entries(doc.spec.animations).map(([name, a]) => (
            <option key={name} value={name}>{name}{a.additive ? " +" : ""}</option>
          ))}
        </select>
        <input
          placeholder="new animation"
          value={newAnim}
          onChange={(e) => setNewAnim(e.target.value)}
        />
        <button onClick={addAnimation} disabled={!newAnim.trim()}>Add</button>
        <button onClick={cloneAnimation} disabled={!anim}>Clone</button>
        <button onClick={deleteAnimation} disabled={!anim}>Delete</button>
        <span className="ed-tl-sep" />
        <button onClick={() => actions.setPlaying(!playing)} disabled={!anim}>
          {playing ? "⏸" : "▶"}
        </button>
        <button
          onClick={() => { actions.setPlaying(false); actions.setAnimTime(0); }}
          disabled={!anim}
        >
          ■
        </button>
        <span className="ed-hint">
          {Math.min(animTime, dur).toFixed(2)}s / {dur.toFixed(2)}s
        </span>
        <span className="ed-tl-sep" />
        <label className="ed-tl-check">
          <input
            type="checkbox"
            checked={!!anim?.additive}
            disabled={!anim}
            onChange={(e) => toggleAdditive(e.target.checked)}
          />
          additive
        </label>
        {anim?.additive && (
          <>
            <label>over</label>
            <select value={additiveBase} onChange={(e) => actions.setAdditiveBase(e.target.value)}>
              <option value="">setup pose</option>
              {Object.keys(doc.spec.animations)
                .filter((a) => a !== selAnim)
                .map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
            </select>
          </>
        )}
        <span className="spacer" />
        <button onClick={() => setPxPerSec((p) => Math.max(40, p / 1.4))} title="zoom out">−</button>
        <button onClick={() => setPxPerSec((p) => Math.min(800, p * 1.4))} title="zoom in">+</button>
      </div>
      {anim && (
        <div className="ed-animdock-tools">
          <select value={newTrackBone} onChange={(e) => setNewTrackBone(e.target.value)}>
            <option value="">+ track for bone…</option>
            {doc.spec.bones
              .filter((b) => !anim.bones[b.name])
              .map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
          </select>
          <button
            disabled={!newTrackBone}
            onClick={() => {
              setAnim((a) => ({
                ...a,
                bones: { ...a.bones, [newTrackBone]: { rotate: [{ time: 0, value: 0 }] } },
              }));
              actions.setSelBone(newTrackBone);
              setNewTrackBone("");
            }}
          >
            Add track
          </button>
          {selKey && selKeyData && (
            <>
              <span className="ed-tl-sep" />
              <span className="ed-tl-keylabel">
                {selKey.bone} · {selKey.kind}
              </span>
              <label>t</label>
              <input
                type="number"
                step={0.01}
                value={selKeyData.key.time}
                onChange={(e) => editKey(selKey.bone, selKey.kind, selKey.idx, { time: Number(e.target.value) })}
              />
              {selKey.kind === "rotate" ? (
                <>
                  <label>deg</label>
                  <input
                    type="number"
                    step={1}
                    value={(selKeyData.key as RotKey).value}
                    onChange={(e) => editKey(selKey.bone, selKey.kind, selKey.idx, { value: Number(e.target.value) })}
                  />
                </>
              ) : (
                <>
                  <label>x</label>
                  <input
                    type="number"
                    step={0.1}
                    value={(selKeyData.key as TransKey).x}
                    onChange={(e) => editKey(selKey.bone, selKey.kind, selKey.idx, { x: Number(e.target.value) })}
                  />
                  <label>y</label>
                  <input
                    type="number"
                    step={0.1}
                    value={(selKeyData.key as TransKey).y}
                    onChange={(e) => editKey(selKey.bone, selKey.kind, selKey.idx, { y: Number(e.target.value) })}
                  />
                </>
              )}
              <button onClick={() => removeKey(selKey.bone, selKey.kind, selKey.idx)}>del key</button>
            </>
          )}
        </div>
      )}
      {anim ? (
        <Timeline
          anim={anim}
          bones={doc.spec.bones.map((b) => b.name)}
          dur={dur}
          tlDur={tlDur}
          tlW={tlW}
          pxPerSec={pxPerSec}
          animTime={Math.min(animTime, tlDur)}
          selBone={selBone}
          selKey={selKey}
          onSelKey={setSelKey}
          onSelectBone={actions.setSelBone}
          onScrub={(t) => { actions.setPlaying(false); actions.setAnimTime(t); }}
          onAddKey={addKey}
          onEditKey={editKey}
          onRemoveTrack={(bone) =>
            setAnim((a) => {
              const bones = { ...a.bones };
              delete bones[bone];
              return { ...a, bones };
            })
          }
        />
      ) : (
        <div className="ed-animdock-empty ed-hint">No animation selected.</div>
      )}
    </div>
  );
}

function Timeline({
  anim,
  bones,
  dur,
  tlDur,
  tlW,
  pxPerSec,
  animTime,
  selBone,
  selKey,
  onSelKey,
  onSelectBone,
  onScrub,
  onAddKey,
  onEditKey,
  onRemoveTrack,
}: {
  anim: SpineAnim;
  bones: string[];
  dur: number;
  tlDur: number;
  tlW: number;
  pxPerSec: number;
  animTime: number;
  selBone: string | null;
  selKey: KeyRef;
  onSelKey: (k: KeyRef) => void;
  onSelectBone: (b: string) => void;
  onScrub: (t: number) => void;
  onAddKey: (bone: string, kind: "rotate" | "translate") => void;
  onEditKey: (bone: string, kind: "rotate" | "translate", idx: number, patch: object) => number;
  onRemoveTrack: (bone: string) => void;
}) {
  // Tick density: minor every 0.1s, labels at 0.5s (1s when zoomed far out).
  const labelStep = pxPerSec * 0.5 >= 56 ? 0.5 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= tlDur + 1e-6; t += 0.1) ticks.push(Math.round(t * 10) / 10);

  const scrubFrom = (e: React.PointerEvent | PointerEvent, lane: HTMLElement) => {
    const rect = lane.getBoundingClientRect();
    onScrub(Math.max(0, Math.min(tlDur, (e.clientX - rect.left) / pxPerSec)));
  };

  const rulerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const lane = e.currentTarget;
    scrubFrom(e, lane);
    const move = (ev: PointerEvent) => scrubFrom(ev, lane);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const keyDown = (
    e: React.PointerEvent,
    bone: string,
    kind: "rotate" | "translate",
    idx: number,
  ) => {
    e.stopPropagation();
    onSelKey({ bone, kind, idx });
    onSelectBone(bone);
    const lane = (e.currentTarget as HTMLElement).parentElement!;
    let curIdx = idx;
    const move = (ev: PointerEvent) => {
      const rect = lane.getBoundingClientRect();
      const t = Math.max(0, Math.min(tlDur, (ev.clientX - rect.left) / pxPerSec));
      // Editing re-sorts the track — follow the key to its new index so the
      // drag never transfers to a neighboring key.
      curIdx = onEditKey(bone, kind, curIdx, { time: Math.round(t * 100) / 100 });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const channel = (bone: string, tracks: BoneTracks, kind: "rotate" | "translate", first: boolean) => {
    const keys = tracks[kind] ?? [];
    const sel = selKey?.bone === bone && selKey.kind === kind ? selKey.idx : -1;
    return (
      <div className="ed-tl-row" key={kind}>
        <div className="ed-tl-label">
          {first ? (
            <>
              <strong
                className={bone === selBone ? "sel" : undefined}
                onClick={() => onSelectBone(bone)}
              >
                {bone}
              </strong>
              <button
                className="ed-tl-x"
                title="remove all tracks for this bone"
                onClick={() => onRemoveTrack(bone)}
              >
                ×
              </button>
            </>
          ) : (
            <span className="ed-tl-spacer" />
          )}
          <span className="ed-tl-chan">{kind === "rotate" ? "rot" : "pos"}</span>
          <button
            className="ed-tl-addkey"
            title="add key at current time"
            onClick={() => onAddKey(bone, kind)}
          >
            ◆+
          </button>
        </div>
        <div className="ed-tl-lane" style={{ width: tlW }}>
          {keys.map((k, i) => (
            <div
              key={i}
              className={`ed-tl-key ${i === sel ? "sel" : ""}`}
              style={{ left: k.time * pxPerSec }}
              onPointerDown={(e) => keyDown(e, bone, kind, i)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="ed-tl-scroll">
      <div className="ed-tl" style={{ width: LABEL_W + tlW }}>
        <div className="ed-tl-row ed-tl-ruler">
          <div className="ed-tl-label">
            <span className="ed-hint">{dur.toFixed(2)}s</span>
          </div>
          <div className="ed-tl-lane" style={{ width: tlW }} onPointerDown={rulerDown}>
            {ticks.map((t) => (
              <div key={t} className="ed-tl-tick" style={{ left: t * pxPerSec }}>
                {t % labelStep < 1e-6 && <span>{t.toFixed(1)}</span>}
              </div>
            ))}
          </div>
        </div>
        {bones
          .filter((b) => anim.bones[b])
          .map((b) => {
            const tracks = anim.bones[b]!;
            return [
              channel(b, tracks, "rotate", true),
              channel(b, tracks, "translate", false),
            ];
          })}
        <div
          className="ed-tl-playhead"
          style={{ left: LABEL_W + animTime * pxPerSec }}
        />
      </div>
    </div>
  );
}
