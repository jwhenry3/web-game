// Animation timeline dock — a dope-sheet editor for the 3D rig's authored
// clips (rig.anims), shown in the bottom panel on the Characters → Animation
// tab. Track rows are (bone × channel); dragging the gizmo auto-keys at the
// playhead, ◆+ keys one channel, and scrubbing/playing drives the viewport
// preview via RigInstance.previewClip. Mirrors AnimPanel (the 2D rig's
// timeline) so both editors share the ed-animdock/ed-tl styling and UX.

import { useEffect, useRef, useState } from "react";
import type { RigAnimClip, RigAnimName, RigKeyframe, RigTrackChannel } from "../../../../wails/frontend/src/three/rig3d";
import type { CharacterMode } from "./SceneCharacters";

const CLIPS: RigAnimName[] = ["idle", "run", "attack"];
const CHANNELS: RigTrackChannel[] = ["rotation", "position", "scale"];
const CHANNEL_TAG: Record<RigTrackChannel, string> = { rotation: "rot", position: "pos", scale: "scl" };

/** Track label column width; lanes start right of it. */
const LABEL_W = 176;

type KeyRef = { bone: string; channel: RigTrackChannel; idx: number } | null;

export function AnimTimeline({ st }: { st: CharacterMode }) {
  const doc = st.doc!;
  const clip = doc.anims?.[st.clip];
  const [selKey, setSelKey] = useState<KeyRef>(null);
  const [newBone, setNewBone] = useState("");
  const [pxPerSec, setPxPerSec] = useState(160);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  // Refs mirror layout state for the imperative playhead — React state would
  // re-render the dock every frame while playing.
  const pxRef = useRef(pxPerSec);
  pxRef.current = pxPerSec;
  const durRef = useRef(1);
  const keyEnd = clip ? Math.max(0, ...clip.tracks.flatMap(tr => tr.keys.map(k => k.t))) : 0;
  const dur = clip?.duration ?? 0;
  // Half-second runway past the clip/last key so drags can stretch the clip.
  const tlDur = Math.max(Math.max(dur, keyEnd) + .5, 1);
  durRef.current = dur;
  const tlW = tlDur * pxPerSec;

  useEffect(() => {
    st.tlTick(t => {
      if (playheadRef.current) playheadRef.current.style.left = `${LABEL_W + t * pxRef.current}px`;
      if (timeLabelRef.current) timeLabelRef.current.textContent = `${t.toFixed(2)}s / ${durRef.current.toFixed(2)}s`;
    });
    return () => st.tlTick(null);
  }, [st]);
  // Zoom changes playhead geometry — re-emit the current time to reposition.
  useEffect(() => { st.tlSetTime(st.tlGetTime()); }, [pxPerSec, st]);

  const setKeys = (bone: string, channel: RigTrackChannel, keys: RigKeyframe[]) =>
    st.setClipTracks(st.clip, ts => ts.map(tr => tr.bone === bone && tr.channel === channel ? { ...tr, keys } : tr));

  /** Edits a key and re-sorts the track — returns the key's new index so a
   * drag keeps following it. Extends clip.duration past the last key. */
  const editKey = (bone: string, channel: RigTrackChannel, idx: number, patch: Partial<RigKeyframe>): number => {
    const track = clip?.tracks.find(tr => tr.bone === bone && tr.channel === channel);
    const keys = [...(track?.keys ?? [])];
    const keyObj = { ...keys[idx]!, ...patch };
    keys[idx] = keyObj;
    const next = keys.sort((a, b) => a.t - b.t);
    setKeys(bone, channel, next);
    const end = next[next.length - 1]?.t ?? 0;
    if (end > dur) st.setClipProp(st.clip, { duration: Math.ceil(end * 20) / 20 });
    const nextIdx = next.indexOf(keyObj);
    if (selKey?.bone === bone && selKey.channel === channel && selKey.idx === idx) setSelKey({ bone, channel, idx: nextIdx });
    return nextIdx;
  };

  const removeKey = (bone: string, channel: RigTrackChannel, idx: number) => {
    setKeys(bone, channel, (clip?.tracks.find(tr => tr.bone === bone && tr.channel === channel)?.keys ?? []).filter((_, i) => i !== idx));
    setSelKey(null);
  };

  const addTrack = (bone: string, channel: RigTrackChannel) =>
    st.setClipTracks(st.clip, ts => ts.some(tr => tr.bone === bone && tr.channel === channel) ? ts : [...ts, { bone, channel, keys: [] }]);

  const removeBoneTracks = (bone: string) =>
    st.setClipTracks(st.clip, ts => ts.filter(tr => tr.bone !== bone));

  const bonesInClip = clip ? [...new Set(clip.tracks.map(tr => tr.bone))] : [];
  const selKeyData = selKey ? clip?.tracks.find(tr => tr.bone === selKey.bone && tr.channel === selKey.channel)?.keys[selKey.idx] : undefined;

  return (
    <div className="ed-animdock">
      <div className="ed-dock-title">
        <span className="ed-scene-tab">Timeline</span>
        <span>{doc.label || st.rigId}</span>
      </div>
      <div className="ed-animdock-tools">
        <div className="sc-tools" role="tablist" aria-label="Clip">
          {CLIPS.map(n => (
            <button key={n} role="tab" aria-selected={st.clip === n} className={st.clip === n ? "active" : ""}
              onClick={() => { st.setClip(n); setSelKey(null); }}>{n}{doc.anims?.[n] ? " ●" : ""}</button>
          ))}
        </div>
        {clip ? (
          <>
              <button onClick={() => { if (confirm(`Delete the ${st.clip} clip?`)) { st.deleteClip(st.clip); setSelKey(null); } }}>Delete</button>
            <span className="ed-tl-sep" />
            <button onClick={() => st.setTlPlaying(!st.tlPlaying)}>{st.tlPlaying ? "⏸" : "▶"}</button>
            <button onClick={() => { st.setTlPlaying(false); st.tlSetTime(0); }}>■</button>
            <span className="ed-hint" ref={timeLabelRef}>0.00s</span>
            <span className="ed-tl-sep" />
            <label>dur</label>
            <input type="number" min={.05} step={.1} value={dur}
              onChange={e => st.setClipProp(st.clip, { duration: Math.max(.05, +e.target.value || 1) })} />
            <label className="ed-tl-check"><input type="checkbox" checked={clip.loop} onChange={e => st.setClipProp(st.clip, { loop: e.target.checked })} />loop</label>
            <span className="ed-tl-sep" />
            <button disabled={!st.bone} title={st.bone ? `Key ${st.bone}'s pose at the playhead (all its tracks)` : "Click a track row to select its bone"}
              onClick={() => st.recordBone(st.bone)}>◆ key</button>
          </>
        ) : (
          <button className="primary" onClick={() => st.createClip(st.clip)}>+ create {st.clip} clip</button>
        )}
        <span className="spacer" />
        <button onClick={() => setPxPerSec(p => Math.max(40, p / 1.4))} title="zoom out">−</button>
        <button onClick={() => setPxPerSec(p => Math.min(800, p * 1.4))} title="zoom in">+</button>
      </div>
      {clip && (
        <div className="ed-animdock-tools">
          <select value={newBone} onChange={e => setNewBone(e.target.value)}>
            <option value="">+ track for bone…</option>
            {doc.bones.filter(b => !clip.tracks.some(tr => tr.bone === b.name && tr.channel === "rotation"))
              .map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
          <button disabled={!newBone} onClick={() => { addTrack(newBone, "rotation"); st.setBone(newBone); setNewBone(""); }}>Add track</button>
          {selKey && selKeyData && (
            <>
              <span className="ed-tl-sep" />
              <span className="ed-tl-keylabel">{selKey.bone} · {CHANNEL_TAG[selKey.channel]}</span>
              <label>t</label>
              <input type="number" step={.01} value={selKeyData.t}
                onChange={e => editKey(selKey.bone, selKey.channel, selKey.idx, { t: Math.max(0, +e.target.value) })} />
              {["x", "y", "z"].map((axis, i) => (
                <span key={axis} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <label>{axis}</label>
                  <input type="number" step={selKey.channel === "rotation" ? 1 : .05} value={selKeyData.value[i]}
                    onChange={e => editKey(selKey.bone, selKey.channel, selKey.idx,
                      { value: selKeyData.value.map((v, vi) => vi === i ? +e.target.value : v) as RigKeyframe["value"] })} />
                </span>
              ))}
              <button onClick={() => removeKey(selKey.bone, selKey.channel, selKey.idx)}>del key</button>
            </>
          )}
        </div>
      )}
      {clip ? (
        <Timeline
          clip={clip}
          bonesInClip={bonesInClip}
          tlDur={tlDur}
          tlW={tlW}
          pxPerSec={pxPerSec}
          selBone={st.bone}
          selKey={selKey}
          onSelKey={setSelKey}
          onSelectBone={st.setBone}
          onScrub={t => { st.setTlPlaying(false); st.tlSetTime(t); }}
          onAddKey={(bone, channel) => st.recordBone(bone, channel)}
          onEditKey={editKey}
          onRemoveTrack={removeBoneTracks}
          playheadRef={playheadRef}
        />
      ) : (
        <div className="ed-animdock-empty ed-hint">
          No {st.clip} clip yet — create one, then drag a bone with the gizmo or press ◆ key to record keys at the playhead.
        </div>
      )}
    </div>
  );
}

function Timeline({
  clip,
  bonesInClip,
  tlDur,
  tlW,
  pxPerSec,
  selBone,
  selKey,
  onSelKey,
  onSelectBone,
  onScrub,
  onAddKey,
  onEditKey,
  onRemoveTrack,
  playheadRef,
}: {
  clip: RigAnimClip;
  bonesInClip: string[];
  tlDur: number;
  tlW: number;
  pxPerSec: number;
  selBone: string;
  selKey: KeyRef;
  onSelKey: (k: KeyRef) => void;
  onSelectBone: (b: string) => void;
  onScrub: (t: number) => void;
  onAddKey: (bone: string, channel: RigTrackChannel) => void;
  onEditKey: (bone: string, channel: RigTrackChannel, idx: number, patch: Partial<RigKeyframe>) => number;
  onRemoveTrack: (bone: string) => void;
  playheadRef: React.RefObject<HTMLDivElement | null>;
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

  const keyDown = (e: React.PointerEvent, bone: string, channel: RigTrackChannel, idx: number) => {
    e.stopPropagation();
    onSelKey({ bone, channel, idx });
    onSelectBone(bone);
    const lane = (e.currentTarget as HTMLElement).parentElement!;
    let curIdx = idx;
    const move = (ev: PointerEvent) => {
      const rect = lane.getBoundingClientRect();
      const t = Math.max(0, Math.min(tlDur, (ev.clientX - rect.left) / pxPerSec));
      // Editing re-sorts the track — follow the key to its new index so the
      // drag never transfers to a neighboring key.
      curIdx = onEditKey(bone, channel, curIdx, { t: Math.round(t * 100) / 100 });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const trackFor = (bone: string, channel: RigTrackChannel) =>
    clip.tracks.find(tr => tr.bone === bone && tr.channel === channel);

  const channel = (bone: string, channel: RigTrackChannel, first: boolean) => {
    const keys = trackFor(bone, channel)?.keys ?? [];
    const sel = selKey?.bone === bone && selKey.channel === channel ? selKey.idx : -1;
    return (
      <div className="ed-tl-row" key={`${bone}.${channel}`}>
        <div className="ed-tl-label">
          {first ? (
            <>
              <strong className={bone === selBone ? "sel" : undefined} onClick={() => onSelectBone(bone)}>{bone}</strong>
              <button className="ed-tl-x" title="remove all tracks for this bone" onClick={() => onRemoveTrack(bone)}>×</button>
            </>
          ) : (
            <span className="ed-tl-spacer" />
          )}
          <span className="ed-tl-chan">{CHANNEL_TAG[channel]}</span>
          <button className="ed-tl-addkey" title="key this channel at the playhead" onClick={() => onAddKey(bone, channel)}>◆+</button>
        </div>
        <div className="ed-tl-lane" style={{ width: tlW }}>
          {keys.map((k, i) => (
            <div key={i} className={`ed-tl-key ${i === sel ? "sel" : ""}`} style={{ left: k.t * pxPerSec }}
              title={`${k.t.toFixed(2)}s`} onPointerDown={e => keyDown(e, bone, channel, i)} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="ed-tl-scroll">
      <div className="ed-tl" style={{ width: LABEL_W + tlW }}>
        <div className="ed-tl-row ed-tl-ruler">
          <div className="ed-tl-label"><span className="ed-hint">{clip.duration.toFixed(2)}s{clip.loop ? " ⟳" : ""}</span></div>
          <div className="ed-tl-lane" style={{ width: tlW }} onPointerDown={rulerDown}>
            {ticks.map(t => (
              <div key={t} className="ed-tl-tick" style={{ left: t * pxPerSec }}>
                {t % labelStep < 1e-6 && <span>{t.toFixed(1)}</span>}
              </div>
            ))}
          </div>
        </div>
        {bonesInClip.map(bone =>
          CHANNELS.filter(ch => trackFor(bone, ch)).map((ch, i) => channel(bone, ch, i === 0))
        )}
        {/* Positioned imperatively by the host's tlTick callback. */}
        <div className="ed-tl-playhead" ref={playheadRef} />
      </div>
    </div>
  );
}
