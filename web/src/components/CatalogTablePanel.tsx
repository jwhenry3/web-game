import { type ReactNode, useEffect, useMemo, useState } from "react";

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
          className="xiv-input map-editor-catalog-table-search"
          type="search"
          value={search}
          placeholder={searchPlaceholder}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filters.map((filter) => (
          <label key={filter.id} className="map-editor-catalog-table-filter">
            <span className="dim">{filter.label}</span>
            <select
              className="xiv-input"
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
}

export type CatalogViewTab = "catalog" | "detail";

export interface CatalogTabbedEditorProps<T extends { id: string; name: string }> {
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
  onDraftChange?: (draft: T) => void;
  viewTab: CatalogViewTab;
  onViewTabChange: (tab: CatalogViewTab) => void;
}

export function CatalogTabbedEditor<T extends { id: string; name: string }>({
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
  emptyDetailHint = "Select an entry from the catalog tab.",
  renderDetail,
  detailSections,
  onDraftChange,
  viewTab,
  onViewTabChange,
}: CatalogTabbedEditorProps<T>) {
  const [detailTab, setDetailTab] = useState(detailSections?.[0]?.id ?? "main");

  useEffect(() => {
    if (detailSections?.length) setDetailTab(detailSections[0].id);
  }, [selectedId, detailSections]);

  const handleSelect = (id: string) => {
    onSelect(id);
    onViewTabChange("detail");
  };

  const activeDetailSection = detailSections?.find((s) => s.id === detailTab);

  return (
    <div className="map-editor-catalog-tabbed xiv-window">
      <div className="map-editor-catalog-view-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={viewTab === "catalog"}
          className={`map-editor-catalog-view-tab ${viewTab === "catalog" ? "on" : ""}`}
          onClick={() => onViewTabChange("catalog")}
        >
          {listTitle}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewTab === "detail"}
          className={`map-editor-catalog-view-tab ${viewTab === "detail" ? "on" : ""}`}
          disabled={!draft}
          onClick={() => onViewTabChange("detail")}
        >
          {draft ? (
            <>
              {draft.name}
              {dirty ? <span className="map-editor-catalog-dirty"> *</span> : null}
            </>
          ) : (
            "Details"
          )}
        </button>
      </div>

      <div className="xiv-body map-editor-catalog-view-body">
        {viewTab === "catalog" ? (
          <CatalogTableView
            items={items}
            columns={columns}
            filters={filters}
            searchPlaceholder={searchPlaceholder}
            getSearchText={getSearchText}
            selectedId={selectedId}
            onSelect={handleSelect}
            emptyHint={emptyHint}
          />
        ) : draft ? (
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
            <div className="map-editor-inspector map-editor-catalog-detail-content">
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
      </div>
    </div>
  );
}