"use client";

import { Filter, Pencil, Plus, Search } from "lucide-react";
import { EmptyState, StatusBadge } from "@/features/forms";
import shared from "@/features/forms/feature-ui.module.css";
import { InventoryCard } from "./InventoryCard";
import type {
  InventoryAsset,
  InventoryAssetKind,
  InventoryFilterState,
  LocationOption,
  SmartState,
} from "./types";
import styles from "./inventory.module.css";

const kindOptions: Array<{ value: InventoryAssetKind | "all"; label: string }> = [
  { value: "all", label: "All types" },
  { value: "switch", label: "Switches" },
  { value: "receptacle", label: "Receptacles" },
  { value: "fixture", label: "Fixtures" },
  { value: "light-source", label: "Light sources" },
  { value: "appliance", label: "Appliances" },
  { value: "box", label: "Boxes" },
  { value: "cable", label: "Cables" },
  { value: "panel", label: "Panels" },
  { value: "junction", label: "Junctions" },
  { value: "other", label: "Other" },
];

const smartOptions: Array<{ value: SmartState | "all"; label: string }> = [
  { value: "all", label: "Any smart state" },
  { value: "smart", label: "Smart" },
  { value: "dumb", label: "Dumb" },
  { value: "mixed", label: "Mixed" },
  { value: "unknown", label: "Unknown" },
  { value: "not-applicable", label: "Not applicable" },
];

export function filterInventory(
  assets: InventoryAsset[],
  filters: InventoryFilterState,
) {
  const needle = filters.query.trim().toLocaleLowerCase();
  return assets.filter((asset) => {
    if (filters.kind !== "all" && asset.kind !== filters.kind) return false;
    if (filters.smartState !== "all" && asset.smartState !== filters.smartState) return false;
    if (
      filters.locationId !== "all" &&
      asset.locationId !== filters.locationId
    ) {
      return false;
    }
    if (
      filters.needsReviewOnly &&
      !asset.issueCount &&
      asset.verification !== "unknown" &&
      asset.verification !== "conflicting"
    ) {
      return false;
    }
    if (!needle) return true;
    return [
      asset.displayName,
      asset.permanentCode,
      asset.kind,
      asset.subtype,
      asset.locationLabel,
      asset.locatorLabel,
      asset.boxLabel,
      asset.installedProduct?.manufacturer,
      asset.installedProduct?.model,
      asset.installedProduct?.protocol,
      ...(asset.tags ?? []),
      ...asset.breakerReferences.flatMap((breaker) => [breaker.label, breaker.permanentCode]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle);
  });
}

export type InventoryListProps = {
  assets: InventoryAsset[];
  filters: InventoryFilterState;
  locationOptions: LocationOption[];
  selectedAssetId?: string;
  onFiltersChange: (filters: InventoryFilterState) => void;
  onSelectAsset: (assetId: string) => void;
  onCreateAsset?: () => void;
  onEditAsset?: (assetId: string) => void;
};

export function InventoryList({
  assets,
  filters,
  locationOptions,
  selectedAssetId,
  onFiltersChange,
  onSelectAsset,
  onCreateAsset,
  onEditAsset,
}: InventoryListProps) {
  const filteredAssets = filterInventory(assets, filters);
  const patchFilters = (patch: Partial<InventoryFilterState>) =>
    onFiltersChange({ ...filters, ...patch });

  return (
    <section className={styles.listShell} aria-label="Inventory">
      <header className={`${shared.surface} ${styles.toolbar}`}>
        <div className={styles.toolbarTop}>
          <div>
            <p className={shared.eyebrow}>Property records</p>
            <h1 className={shared.title}>Inventory</h1>
            <p className={shared.subtle}>
              Switches, receptacles, fixtures, bulbs, appliances, boxes, and cabling.
            </p>
          </div>
          <div className={shared.buttonRow}>
            <StatusBadge tone="neutral">
              {filteredAssets.length} of {assets.length}
            </StatusBadge>
            {onEditAsset && selectedAssetId ? (
              <button
                className={`${shared.button} ${shared.buttonSecondary}`}
                type="button"
                onClick={() => onEditAsset(selectedAssetId)}
              >
                <Pencil size={15} aria-hidden="true" /> Edit selected
              </button>
            ) : null}
            {onCreateAsset ? (
              <button
                className={`${shared.button} ${shared.buttonPrimary}`}
                type="button"
                onClick={onCreateAsset}
              >
                <Plus size={15} aria-hidden="true" /> Add record
              </button>
            ) : null}
          </div>
        </div>
        <div className={styles.filters}>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} size={16} aria-hidden="true" />
            <input
              className={`${shared.input} ${styles.searchInput}`}
              type="search"
              value={filters.query}
              placeholder="Search name, code, product, breaker…"
              aria-label="Search inventory"
              onChange={(event) => patchFilters({ query: event.target.value })}
            />
          </div>
          <select
            className={shared.select}
            value={filters.kind}
            aria-label="Filter by record type"
            onChange={(event) => patchFilters({ kind: event.target.value as InventoryFilterState["kind"] })}
          >
            {kindOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            className={shared.select}
            value={filters.smartState}
            aria-label="Filter by smart state"
            onChange={(event) => patchFilters({ smartState: event.target.value as InventoryFilterState["smartState"] })}
          >
            {smartOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            className={shared.select}
            value={filters.locationId}
            aria-label="Filter by location"
            onChange={(event) => patchFilters({ locationId: event.target.value })}
          >
            <option value="all">All locations</option>
            {locationOptions.map((location) => (
              <option key={location.id} value={location.id}>{location.label}</option>
            ))}
          </select>
        </div>
        <label className={styles.reviewToggle}>
          <input
            type="checkbox"
            checked={filters.needsReviewOnly}
            onChange={(event) => patchFilters({ needsReviewOnly: event.target.checked })}
          />
          <Filter size={14} aria-hidden="true" /> Show only records needing review
        </label>
      </header>

      {filteredAssets.length ? (
        <div className={styles.cardGrid}>
          {filteredAssets.map((asset) => (
            <InventoryCard
              asset={asset}
              selected={asset.id === selectedAssetId}
              key={asset.id}
              onSelect={onSelectAsset}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Search size={20} />}
          title="No records match"
          description="Clear a filter or search for another name, code, product, breaker, or location."
          action={
            <button
              className={`${shared.button} ${shared.buttonSecondary}`}
              type="button"
              onClick={() =>
                onFiltersChange({
                  query: "",
                  kind: "all",
                  smartState: "all",
                  locationId: "all",
                  needsReviewOnly: false,
                })
              }
            >
              Clear filters
            </button>
          }
        />
      )}
    </section>
  );
}
