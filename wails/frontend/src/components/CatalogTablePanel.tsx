import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";

export interface CatalogTableColumn<T> {
  id: string;
  label: string;
  width?: string;
  render: (item: T) => ReactNode;
}

export interface CatalogTableFilter<T> {
  id: string;
  label: string;
  options: { id: string; label: string }[];
  allLabel?: string;
  match: (item: T, value: string) => boolean;
}

export interface CatalogTableViewProps<T extends { id: string; name: string }> {
  items: T[];
  columns: CatalogTableColumn<T>[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyHint: string;
  filters?: CatalogTableFilter<T>[];
  searchPlaceholder?: string;
  getSearchText?: (item: T) => string;
  itemCount?: ReactNode;
}

function defaultSearchText<T extends { id: string; name: string }>(item: T): string {
  return `${item.name} ${item.id}`;
}

export function CatalogTableView<T extends { id: string; name: string }>({
  items,
  columns,
  selectedId,
  onSelect,
  emptyHint,
  filters = [],
  searchPlaceholder = "Search…",
  getSearchText = defaultSearchText,
  itemCount,
}: CatalogTableViewProps<T>) {
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(filters.map((f) => [f.id, ""])),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...items]
      .filter((item) => {
        if (q && !getSearchText(item).toLowerCase().includes(q)) return false;
        for (const filter of filters) {
          const value = filterValues[filter.id] ?? "";
          if (value && !filter.match(item, value)) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search, filters, filterValues, getSearchText]);

  const setFilter = (id: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [id]: value }));
  };

  const countLabel =
    itemCount ??
    (filtered.length === items.length ? `${items.length}` : `${filtered.length} / ${items.length}`);

  return (
    <div className="map-editor-catalog-table-body">
      <div className="map-editor-catalog-table-filters">
        <input
          className="cm-input map-editor-catalog-table-search"
          type="search"
          value={search}
          placeholder={searchPlaceholder}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filters.map((filter) => (
          <label key={filter.id} className="map-editor-catalog-table-filter">
            <span className="dim">{filter.label}</span>
            <select
              className="cm-input"
              value={filterValues[filter.id] ?? ""}
              onChange={(e) => setFilter(filter.id, e.target.value)}
            >
              <option value="">{filter.allLabel ?? "All"}</option>
              {filter.options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <span className="dim map-editor-catalog-table-count">{countLabel}</span>
      </div>

      {items.length === 0 ? (
        <p className="dim map-editor-catalog-table-empty">{emptyHint}</p>
      ) : filtered.length === 0 ? (
        <p className="dim map-editor-catalog-table-empty">No entries match the current filters.</p>
      ) : (
        <div className="map-editor-catalog-table-scroll">
          <table className="map-editor-catalog-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.id} style={col.width ? { width: col.width } : undefined}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className={selectedId === item.id ? "selected" : undefined}
                  onClick={() => onSelect(item.id)}
                >
                  {columns.map((col) => (
                    <td key={col.id}>{col.render(item)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export interface CatalogDetailSection {
  id: string;
  label: string;
  content: ReactNode;
  /** Flex grow hint for column layout (default 1). */
  grow?: number;
  /** Preferred min width in column layout. */
  minWidth?: number;
}

export type CatalogDetailLayout = "tabs" | "columns";

export interface CatalogSplitEditorProps<T extends { id: string; name: string }> {
  listTitle: string;
  items: T[];
  columns: CatalogTableColumn<T>[];
  filters?: CatalogTableFilter<T>[];
  searchPlaceholder?: string;
  getSearchText?: (item: T) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  draft: T | null;
  dirty?: boolean;
  emptyHint: string;
  emptyDetailHint?: string;
  renderDetail?: (draft: T, onChange: (draft: T) => void) => ReactNode;
  detailSections?: CatalogDetailSection[];
  /** How to present detailSections. Default: tabs in one inspector. */
  detailLayout?: CatalogDetailLayout;
  onDraftChange?: (draft: T) => void;
}

function CatalogInspectorPanel({
  title,
  children,
  className,
  style,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`map-editor-inspector-panel map-editor-catalog-inspector cm-window ${className ?? ""}`} style={style}>
      <div className="cm-titlebar">
        <span className="cm-title">{title}</span>
      </div>
      <div className="cm-body map-editor-inspector-body">
        <div className="map-editor-inspector map-editor-catalog-detail-content">{children}</div>
      </div>
    </div>
  );
}

/** Table on the left (grows horizontally); inspector panel(s) on the right. */
export function CatalogSplitEditor<T extends { id: string; name: string }>({
  listTitle,
  items,
  columns,
  filters,
  searchPlaceholder,
  getSearchText,
  selectedId,
  onSelect,
  draft,
  dirty = false,
  emptyHint,
  emptyDetailHint = "Select an entry from the catalog.",
  renderDetail,
  detailSections,
  detailLayout = "tabs",
  onDraftChange,
}: CatalogSplitEditorProps<T>) {
  const [detailTab, setDetailTab] = useState(detailSections?.[0]?.id ?? "main");

  useEffect(() => {
    if (detailSections?.length) setDetailTab(detailSections[0].id);
  }, [selectedId, detailSections]);

  const activeDetailSection = detailSections?.find((s) => s.id === detailTab);
  const dirtyMark = dirty ? " *" : "";
  const useColumns = detailLayout === "columns" && (detailSections?.length ?? 0) > 0;

  return (
    <div className={`map-editor-layout map-editor-layout--catalog ${useColumns ? "map-editor-layout--catalog-columns" : ""}`}>
      <div className="map-editor-catalog-list-panel cm-window">
        <div className="cm-titlebar">
          <span className="cm-title">{listTitle}</span>
        </div>
        <div className="cm-body map-editor-catalog-list-body">
          <CatalogTableView
            items={items}
            columns={columns}
            filters={filters}
            searchPlaceholder={searchPlaceholder}
            getSearchText={getSearchText}
            selectedId={selectedId}
            onSelect={onSelect}
            emptyHint={emptyHint}
          />
        </div>
      </div>

      {useColumns ? (
        draft && detailSections ? (
          detailSections.map((section) => (
            <CatalogInspectorPanel
              key={section.id}
              title={`${section.label}${section.id === detailSections[0].id ? dirtyMark : ""}`}
              className="map-editor-catalog-inspector--column"
              style={{
                flexGrow: section.grow ?? 1,
                flexShrink: 1,
                flexBasis: section.minWidth ?? 300,
                minWidth: section.minWidth ?? 260,
              }}
            >
              {section.content}
            </CatalogInspectorPanel>
          ))
        ) : (
          <CatalogInspectorPanel title="Inspector" className="map-editor-catalog-inspector--column">
            <p className="dim map-editor-inspector-empty">{emptyDetailHint}</p>
          </CatalogInspectorPanel>
        )
      ) : (
        <CatalogInspectorPanel title={draft ? `${draft.name}${dirtyMark}` : "Inspector"}>
          {draft ? (
            <>
              {detailSections && detailSections.length > 1 ? (
                <div className="map-editor-toolbox-tabs map-editor-catalog-detail-tabs">
                  {detailSections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className={`map-editor-toolbox-tab ${detailTab === section.id ? "on" : ""}`}
                      onClick={() => setDetailTab(section.id)}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="map-editor-catalog-detail-body">
                {detailSections
                  ? activeDetailSection?.content
                  : renderDetail && onDraftChange
                    ? renderDetail(draft, onDraftChange)
                    : null}
              </div>
            </>
          ) : (
            <p className="dim map-editor-inspector-empty">{emptyDetailHint}</p>
          )}
        </CatalogInspectorPanel>
      )}
    </div>
  );
}

