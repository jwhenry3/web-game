import { type ReactNode } from "react";
import { HoverTooltip } from "../ui/HoverTooltip";
import {
  CatalogSplitEditor,
  type CatalogTableColumn,
  type CatalogTableFilter,
  type CatalogDetailSection,
  type CatalogDetailLayout,
} from "./CatalogTablePanel";

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M7 2h2v5h5v2H9v5H7V9H2V7h5z" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M2 1.5h9.2L14.5 4.8V14.5H2zM3.5 3v4h7V3zm1.5 0h4v2.5H5zm-1.5 5.5v5h8v-5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 1h4l1 1h3v2H2V2h3zm-.5 4h9l-.7 9.2A1.5 1.5 0 0 1 12.3 15H3.7a1.5 1.5 0 0 1-1.5-1.4z"
      />
    </svg>
  );
}

function ToolbarIconButton({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "gold" | "danger";
  children: ReactNode;
}) {
  return (
    <HoverTooltip content={label} disabled={disabled}>
      <button
        type="button"
        className={`xiv-btn map-editor-chrome-icon-btn ${tone === "gold" ? "gold" : ""} ${tone === "danger" ? "danger" : ""}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        {children}
      </button>
    </HoverTooltip>
  );
}

export interface CatalogEditorToolbarProps {
  status: string | null;
  error: string | null;
  dirty: boolean;
  hasDraft: boolean;
  createLabel: string;
  saveLabel: string;
  deleteLabel: string;
  canCreate?: boolean;
  canDelete?: boolean;
  onNew: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export function CatalogEditorToolbar({
  status,
  error,
  dirty,
  hasDraft,
  createLabel,
  saveLabel,
  deleteLabel,
  canCreate = true,
  canDelete = true,
  onNew,
  onSave,
  onDelete,
}: CatalogEditorToolbarProps) {
  return (
    <div className="map-editor-chrome map-editor-chrome--toolbar xiv-window">
      <div className="map-editor-chrome-toolbar map-editor-entity-toolbar">
        {(status || error) && (
          <div className="map-editor-chrome-messages">
            {status && <p className="map-editor-status">{status}</p>}
            {error && <p className="error-text">{error}</p>}
          </div>
        )}
        <div className="map-editor-chrome-actions">
          {canCreate && (
            <ToolbarIconButton label={createLabel} onClick={onNew} tone="gold">
              <PlusIcon />
            </ToolbarIconButton>
          )}
          <ToolbarIconButton label={dirty ? saveLabel : "Saved"} onClick={onSave} disabled={!hasDraft || !dirty} tone={dirty ? "gold" : undefined}>
            <SaveIcon />
          </ToolbarIconButton>
          {canDelete && (
            <ToolbarIconButton label={deleteLabel} onClick={onDelete} disabled={!hasDraft} tone="danger">
              <TrashIcon />
            </ToolbarIconButton>
          )}
        </div>
      </div>
    </div>
  );
}

export type { CatalogTableColumn, CatalogTableFilter, CatalogDetailSection, CatalogDetailLayout } from "./CatalogTablePanel";
export { CatalogSplitEditor, CatalogTableView } from "./CatalogTablePanel";

interface Props<T extends { id: string; name: string }> {
  listTitle: string;
  items: T[];
  columns: CatalogTableColumn<T>[];
  filters?: CatalogTableFilter<T>[];
  searchPlaceholder?: string;
  getSearchText?: (item: T) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  draft: T | null;
  dirty: boolean;
  status: string | null;
  error: string | null;
  emptyHint: string;
  canCreate?: boolean;
  canDelete?: boolean;
  onNew: () => void;
  onSave: () => void;
  onDelete: () => void;
  onDraftChange: (draft: T) => void;
  renderDetail?: (draft: T, onChange: (draft: T) => void) => ReactNode;
  detailSections?: (draft: T, onChange: (draft: T) => void) => CatalogDetailSection[];
  detailLayout?: CatalogDetailLayout;
}

export function CatalogEditorShell<T extends { id: string; name: string }>({
  listTitle,
  items,
  columns,
  filters,
  searchPlaceholder,
  getSearchText,
  selectedId,
  onSelect,
  draft,
  dirty,
  status,
  error,
  emptyHint,
  canCreate = true,
  canDelete = true,
  onNew,
  onSave,
  onDelete,
  onDraftChange,
  renderDetail,
  detailSections,
  detailLayout,
}: Props<T>) {
  const sections = draft && detailSections ? detailSections(draft, onDraftChange) : undefined;

  return (
    <div className="map-editor-entities-shell">
      <CatalogEditorToolbar
        status={status}
        error={error}
        dirty={dirty}
        hasDraft={!!draft}
        createLabel={`New ${listTitle.slice(0, -1).toLowerCase()}`}
        saveLabel="Save changes"
        deleteLabel={`Delete ${listTitle.slice(0, -1).toLowerCase()}`}
        canCreate={canCreate}
        canDelete={canDelete}
        onNew={onNew}
        onSave={onSave}
        onDelete={onDelete}
      />

      <CatalogSplitEditor
        listTitle={listTitle}
        items={items}
        columns={columns}
        filters={filters}
        searchPlaceholder={searchPlaceholder}
        getSearchText={getSearchText}
        selectedId={selectedId}
        onSelect={onSelect}
        draft={draft}
        dirty={dirty}
        emptyHint={emptyHint}
        renderDetail={renderDetail}
        detailSections={sections}
        detailLayout={detailLayout}
        onDraftChange={onDraftChange}
      />
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="field-label">{children}</label>;
}

export function TextField({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  return (
    <>
      <FieldLabel>{label}</FieldLabel>
      <input
        className="xiv-input"
        value={value}
        readOnly={readOnly}
        disabled={readOnly}
        placeholder={placeholder}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <>
      <FieldLabel>{label}</FieldLabel>
      <input
        className="xiv-input"
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="map-editor-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <>
      <FieldLabel>{label}</FieldLabel>
      <select className="xiv-input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <>
      <FieldLabel>{label}</FieldLabel>
      <textarea className="xiv-input map-editor-textarea" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </>
  );
}
