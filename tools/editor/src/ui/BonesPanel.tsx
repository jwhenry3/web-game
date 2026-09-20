import { useState } from "react";
import type { Doc } from "../model/types";

interface Actions {
  setSpec: (fn: (s: Doc["spec"]) => Doc["spec"]) => void;
  setSkeleton: (fn: (s: Doc["skeleton"]) => Doc["skeleton"]) => void;
  setSelBone: (b: string | null) => void;
}

export function BonesPanel({
  doc,
  selBone,
  actions,
}: {
  doc: Doc;
  selBone: string | null;
  actions: Actions;
}) {
  const [newName, setNewName] = useState("");
  const bone = doc.spec.bones.find((b) => b.name === selBone);
  const boneNames = new Set(doc.spec.bones.map((b) => b.name));

  const setField = (field: "x" | "y" | "parent", v: number | string | null) => {
    if (!selBone) return;
    actions.setSpec((s) => ({
      ...s,
      bones: s.bones.map((b) =>
        b.name === selBone ? { ...b, [field]: v === "" ? null : v } : b,
      ),
    }));
  };

  const addBone = () => {
    const name = newName.trim();
    if (!name || boneNames.has(name)) return;
    actions.setSpec((s) => ({
      ...s,
      bones: [...s.bones, { name, parent: selBone ?? "root", x: 0, y: 8 }],
    }));
    actions.setSelBone(name);
    setNewName("");
  };

  const delBone = () => {
    if (!selBone || selBone === "root") return;
    // Slots bound to this bone would dangle — block; children reparent up.
    const used = doc.skeleton.slots.some((s) => s.bone === selBone);
    if (used) {
      alert(`Bone "${selBone}" has slots attached — move them first.`);
      return;
    }
    const parent = bone?.parent ?? null;
    actions.setSpec((s) => ({
      ...s,
      bones: s.bones
        .filter((b) => b.name !== selBone)
        .map((b) => (b.parent === selBone ? { ...b, parent } : b)),
      animations: Object.fromEntries(
        Object.entries(s.animations).map(([k, a]) => {
          const bones = { ...a.bones };
          delete bones[selBone];
          return [k, { ...a, bones }];
        }),
      ),
    }));
    actions.setSelBone(null);
  };

  return (
    <>
      {!bone && <p className="ed-hint">Select a bone in the Hierarchy or Scene to inspect its transform.</p>}
      {bone && (
        <>
          <h3>{bone.name}</h3>
          <div className="ed-row">
            <label>parent</label>
            <select
              value={bone.parent ?? ""}
              onChange={(e) => setField("parent", e.target.value || null)}
            >
              <option value="">— none —</option>
              {doc.spec.bones
                .filter((b) => b.name !== bone.name)
                .map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
            </select>
          </div>
          <div className="ed-row">
            <label>world x</label>
            <input
              type="number"
              step={0.5}
              value={bone.x}
              onChange={(e) => setField("x", Number(e.target.value))}
            />
            <label>y</label>
            <input
              type="number"
              step={0.5}
              value={bone.y}
              onChange={(e) => setField("y", Number(e.target.value))}
            />
          </div>
          <div className="ed-hint">
            World position in spine coords (y-up, origin at feet). Drag the bone in
            the viewport to move it; descendants follow.
          </div>
          <div className="ed-row">
            <button onClick={delBone} disabled={bone.name === "root"}>
              Delete bone
            </button>
          </div>
        </>
      )}
      <h3>Add bone</h3>
      <div className="ed-row">
        <input
          placeholder="bone name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button onClick={addBone} disabled={!newName.trim() || boneNames.has(newName.trim())}>
          Add
        </button>
      </div>
      <div className="ed-hint">
        New bones parent under the selected bone (or root). Slots bind to bones in
        the Template tab via part rules.
      </div>
    </>
  );
}
