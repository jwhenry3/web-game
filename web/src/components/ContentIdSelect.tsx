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
}

/** Single-select for a content catalog id, preserving unknown legacy values. */
export function ContentIdSelect({
  value,
  onChange,
  options,
  emptyLabel = "— none —",
  className = "xiv-input",
}: Props) {
  const known = new Set(options.map((o) => o.id));
  const extras = value && !known.has(value) ? [{ id: value, name: `${value} (custom)` }] : [];

  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {[...options, ...extras].map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.name} ({opt.id})
        </option>
      ))}
    </select>
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
