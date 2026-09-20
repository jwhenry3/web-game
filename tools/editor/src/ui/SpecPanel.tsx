import type { Doc } from "../App";
import type { Spec } from "../model/types";

const COND_OPS = ["x<", "x<=", "x>", "x>=", "y<", "y<=", "y>", "y>="];

interface Actions {
  setSpec: (fn: (s: Spec) => Spec) => void;
}

export function SpecPanel({ doc, actions }: { doc: Doc; actions: Actions }) {
  const src = doc.spec.source;

  const setSource = (field: keyof Spec["source"], v: number | string) =>
    actions.setSpec((s) => ({ ...s, source: { ...s.source, [field]: v } }));

  const setRule = (i: number, fn: (r: Spec["partRules"][number]) => Spec["partRules"][number]) =>
    actions.setSpec((s) => ({
      ...s,
      partRules: s.partRules.map((r, j) => (j === i ? fn(r) : r)),
    }));

  const moveRule = (i: number, dir: -1 | 1) =>
    actions.setSpec((s) => {
      const rules = [...s.partRules];
      const j = i + dir;
      if (j < 0 || j >= rules.length) return s;
      [rules[i], rules[j]] = [rules[j]!, rules[i]!];
      return { ...s, partRules: rules };
    });

  const setLayer = (i: number, patch: Partial<Spec["layers"][number]>) =>
    actions.setSpec((s) => ({
      ...s,
      layers: s.layers.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    }));

  const partNames = doc.spec.partOrder;

  return (
    <>
      <h3>Slicing source</h3>
      <div className="ed-row">
        <label>frame cell</label>
        <input
          type="number"
          value={src.frame}
          onChange={(e) => setSource("frame", Number(e.target.value))}
        />
        <label>foot x</label>
        <input
          type="number"
          step={0.5}
          value={src.footX}
          onChange={(e) => setSource("footX", Number(e.target.value))}
        />
        <label>foot y</label>
        <input
          type="number"
          step={0.5}
          value={src.footY}
          onChange={(e) => setSource("footY", Number(e.target.value))}
        />
      </div>
      <div className="ed-row">
        <label>overlap px</label>
        <input
          type="number"
          value={src.overlap}
          onChange={(e) => setSource("overlap", Number(e.target.value))}
        />
        <label>atlas width</label>
        <input
          type="number"
          step={256}
          value={src.atlasWidth}
          onChange={(e) => setSource("atlasWidth", Number(e.target.value))}
        />
      </div>
      <div className="ed-hint">
        Source/layer/part changes only take effect after <strong>Regenerate</strong> —
        it re-slices the heroes99 sheets using these rules.
      </div>

      <h3>Part partition rules</h3>
      <div className="ed-hint">Ordered — first matching rule wins. Conds AND together.</div>
      <table className="ed-table">
        <thead>
          <tr><th>part</th><th>conds</th><th /></tr>
        </thead>
        <tbody>
          {doc.spec.partRules.map((r, i) => (
            <tr key={i}>
              <td>
                <select
                  value={r.part}
                  onChange={(e) => setRule(i, (rr) => ({ ...rr, part: e.target.value }))}
                >
                  {[...new Set([...partNames, r.part])].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </td>
              <td>
                {r.conds.map((c, ci) => (
                  <span key={ci} className="ed-row" style={{ display: "inline-flex" }}>
                    <select
                      value={c[0]}
                      onChange={(e) =>
                        setRule(i, (rr) => ({
                          ...rr,
                          conds: rr.conds.map((cc, j) =>
                            j === ci ? [e.target.value, cc[1]] : cc,
                          ),
                        }))
                      }
                    >
                      {COND_OPS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      style={{ width: 52 }}
                      value={c[1]}
                      onChange={(e) =>
                        setRule(i, (rr) => ({
                          ...rr,
                          conds: rr.conds.map((cc, j) =>
                            j === ci ? [cc[0], Number(e.target.value)] : cc,
                          ),
                        }))
                      }
                    />
                    <button
                      onClick={() =>
                        setRule(i, (rr) => ({
                          ...rr,
                          conds: rr.conds.filter((_, j) => j !== ci),
                        }))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => setRule(i, (rr) => ({ ...rr, conds: [...rr.conds, ["y<", 0]] }))}
                >
                  +cond
                </button>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button onClick={() => moveRule(i, -1)}>↑</button>
                <button onClick={() => moveRule(i, 1)}>↓</button>
                <button
                  onClick={() =>
                    actions.setSpec((s) => ({
                      ...s,
                      partRules: s.partRules.filter((_, j) => j !== i),
                    }))
                  }
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ed-row">
        <button
          onClick={() =>
            actions.setSpec((s) => ({
              ...s,
              partRules: [...s.partRules, { part: "torso", conds: [] }],
            }))
          }
        >
          + rule
        </button>
      </div>

      <h3>Layer → part mapping</h3>
      <table className="ed-table">
        <thead>
          <tr><th>layer</th><th>part</th><th>variant overrides</th></tr>
        </thead>
        <tbody>
          {doc.spec.layers.map((l, i) => (
            <tr key={l.name}>
              <td>{l.name}</td>
              <td>
                <select
                  value={l.part}
                  onChange={(e) => setLayer(i, { part: e.target.value })}
                >
                  <option value="auto">auto (rules)</option>
                  {partNames.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  placeholder="prefix=part, …"
                  defaultValue={Object.entries(l.partByVariantPrefix ?? {})
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ")}
                  onBlur={(e) => {
                    const map: Record<string, string> = {};
                    for (const pair of e.target.value.split(",")) {
                      const [k, v] = pair.split("=").map((s) => s.trim());
                      if (k && v) map[k] = v;
                    }
                    setLayer(i, {
                      partByVariantPrefix: Object.keys(map).length ? map : undefined,
                    });
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ed-hint">
        e.g. <code>weapon5=weaponB</code> routes the staff to the back-hand bone.
      </div>
    </>
  );
}
