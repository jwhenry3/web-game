import type { ReactNode } from "react";
import type { InspectorFrame } from "../editor/inspectorStack";
import { useOptionalInspectorStack } from "../editor/inspectorStack";

interface ContentOption {
  id: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: ContentOption[];
  emptyLabel?: string;
  className?: string;
  /**
   * When set (and an InspectorStackProvider is present), shows an inline button
   * beside the select that opens that nested inspector frame.
   */
  inspectFrame?: InspectorFrame | null;
  inspectLabel?: ReactNode;
}

/** Single-select for a content catalog id, preserving unknown legacy values. */
export function ContentIdSelect({
  value,
  onChange,
  options,
  emptyLabel = "— none —",
  className = "xiv-input",
  inspectFrame,
  inspectLabel = "Inspect",
}: Props) {
  const stack = useOptionalInspectorStack();
  const known = new Set(options.map((o) => o.id));
  const extras = value && !known.has(value) ? [{ id: value, name: `${value} (custom)` }] : [];

  const select = (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {[...options, ...extras].map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.name} ({opt.id})
        </option>
      ))}
    </select>
  );

  if (!inspectFrame || !stack) {
    return select;
  }

  const active = stack.has(inspectFrame.id);
  const disabled = !value;

  return (
    <div className="content-id-select-row">
      {select}
      <button
        type="button"
        className={`xiv-btn content-id-inspect-btn ${active ? "on" : ""}`}
        disabled={disabled}
        title={disabled ? "Select an entry to inspect" : undefined}
        aria-label={typeof inspectLabel === "string" ? inspectLabel : "Inspect"}
        onClick={() => stack.open(inspectFrame)}
      >
        {inspectLabel}
      </button>
    </div>
  );
}

interface MultiProps {
  value: string;
  onChange: (value: string) => void;
  options: ContentOption[];
  emptyHint?: string;
}

/** Checkbox list backed by a comma-separated id string. */
export function ContentIdMultiSelect({ value, onChange, options, emptyHint }: MultiProps) {
  const selected = new Set(
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  const known = new Set(options.map((o) => o.id));
  const custom = [...selected].filter((id) => !known.has(id));

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange([...next].join(","));
  };

  if (options.length === 0 && custom.length === 0) {
    return <p className="dim map-editor-role-hint">{emptyHint ?? "No entries in catalog yet."}</p>;
  }

  return (
    <div className="map-editor-check-list">
      {options.map((opt) => (
        <label key={opt.id} className="map-editor-check">
          <input type="checkbox" checked={selected.has(opt.id)} onChange={(e) => toggle(opt.id, e.target.checked)} />
          {opt.name} ({opt.id})
        </label>
      ))}
      {custom.map((id) => (
        <label key={id} className="map-editor-check" title="Not in catalog — uncheck to remove">
          <input type="checkbox" checked onChange={() => toggle(id, false)} />
          {id} (custom)
        </label>
      ))}
    </div>
  );
}
