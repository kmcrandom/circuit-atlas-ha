"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Dialog, EmptyState } from "@/components/ui";
import {
  AssetEditor,
  EMPTY_ASSET_DRAFT,
  InventoryList,
  type BreakerReference,
  type InventoryAsset,
  type InventoryAssetDraft,
  type InventoryAssetKind,
  type InventoryFilterState,
  type LocationOption,
} from "@/features/inventory";
import { useUrlSelection } from "@/features/selection";
import { apiMutation, apiRequest, propertyApiPath, useApiResource } from "@/lib/client";
import type { InstalledDeviceDetail } from "@/lib/device-details";

import { RouteError, RouteFrame, RouteLoading } from "../route-ui";

type InventoryResponse = {
  items: Array<InventoryAsset & { revision: number }>;
  locations?: LocationOption[];
  options?: {
    locations?: LocationOption[];
    boxes?: LocationOption[];
    breakers?: BreakerReference[];
  };
  locationOptions?: LocationOption[];
  boxOptions?: LocationOption[];
  breakerOptions?: BreakerReference[];
};

const DEFAULT_FILTERS: InventoryFilterState = {
  query: "",
  kind: "all",
  smartState: "all",
  locationId: "all",
  needsReviewOnly: false,
};

const CREATABLE_ASSET_KINDS: InventoryAssetKind[] = [
  "switch",
  "receptacle",
  "fixture",
  "appliance",
  "box",
  "junction",
  "other",
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasProductDetails(product: InventoryAssetDraft["installedProduct"]) {
  return Object.entries(product).some(([key, value]) =>
    key === "deviceDetails"
      ? Array.isArray(value) && value.length > 0
      : value !== null && value !== undefined && value !== "",
  );
}

function createInput(draft: InventoryAssetDraft) {
  return {
    displayName: draft.displayName.trim(),
    kind: draft.kind,
    subtype: draft.subtype,
    locationId: draft.locationId,
    locatorLabel: draft.locatorLabel,
    boxId: draft.boxId,
    gangPosition: draft.gangPosition,
    verification: draft.verification,
    smartState: draft.smartState,
    operationalStatus: draft.operationalStatus,
    switchConfiguration: draft.switchConfiguration,
    receptacleConfiguration: draft.receptacleConfiguration,
    installedProduct: hasProductDetails(draft.installedProduct) ? draft.installedProduct : null,
    lightSources: draft.kind === "fixture"
      ? draft.lightSources.map((source) => ({
          id: UUID_PATTERN.test(source.id) ? source.id : undefined,
          holderLabel: source.holderLabel,
          sourceType: source.sourceType,
          smartState: source.smartState === "mixed" ? "unknown" : source.smartState,
          baseType: source.baseType,
          shape: source.shape,
          technology: source.technology,
          wattage: source.wattage,
          lumens: source.lumens,
          colorTemperature: source.colorTemperature,
          dimmable: source.dimmable,
          manufacturer: source.manufacturer,
          model: source.model,
          serialNumber: source.serialNumber,
          hardwareRevision: source.hardwareRevision,
          firmware: source.firmware,
          protocol: source.protocol,
          ecosystem: source.ecosystem,
          hub: source.hub,
          deviceDetails: source.deviceDetails,
        }))
      : undefined,
    tags: draft.tags,
    notes: draft.notes,
    assertedCircuitIds: draft.breakerIds,
  };
}

function draftFromAsset(asset: InventoryAsset & { revision: number }): InventoryAssetDraft {
  const gangPosition = asset.gangPosition?.replace(/^G/i, "").split("–")[0] ?? null;
  return {
    id: asset.id,
    revision: asset.revision,
    permanentCode: asset.permanentCode,
    displayName: asset.displayName,
    kind: asset.kind,
    subtype: asset.subtype ?? null,
    locationId: asset.locationId ?? null,
    locatorLabel: asset.locatorLabel ?? null,
    boxId: asset.boxId ?? null,
    gangPosition,
    verification: asset.verification,
    smartState: asset.smartState,
    operationalStatus: asset.operationalStatus ?? "unknown",
    breakerIds: asset.assertedCircuitIds ?? [],
    switchConfiguration: asset.switchConfiguration ?? "unknown",
    receptacleConfiguration: asset.receptacleConfiguration ?? "unknown",
    installedProduct: { ...(asset.installedProduct ?? {}) },
    lightSources: (asset.lightSources ?? []).map((source) => ({ ...source })),
    tags: [...(asset.tags ?? [])],
    notes: asset.notes ?? "",
  };
}

export function InventoryClient({ propertyId }: { propertyId: string }) {
  const selection = useUrlSelection();
  const resource = useApiResource<InventoryResponse>(propertyApiPath(propertyId, "assets"));
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [draft, setDraft] = useState<InventoryAssetDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [isLoadingDeviceDetails, setIsLoadingDeviceDetails] = useState(false);
  const [deviceDetailsError, setDeviceDetailsError] = useState<string>();

  const data = resource.data;
  const assets = useMemo(() => data?.items ?? [], [data?.items]);
  const locationOptions = useMemo(
    () =>
      data?.locationOptions ?? data?.locations ?? data?.options?.locations ??
      Array.from(
        new Map(
          assets
            .filter((asset) => asset.locationLabel)
            .map((asset) => [asset.locationLabel as string, { id: asset.locationLabel as string, label: asset.locationLabel as string }]),
        ).values(),
      ),
    [assets, data?.locationOptions, data?.locations, data?.options?.locations],
  );
  const boxOptions =
    data?.boxOptions ?? data?.options?.boxes ??
    assets
      .filter((asset) => asset.kind === "box")
      .map((asset) => ({ id: asset.id, label: `${asset.displayName} · ${asset.permanentCode}` }));

  async function editAsset(assetId: string) {
    const asset = assets.find((candidate) => candidate.id === assetId);
    if (!asset) return;
    setDraft(draftFromAsset(asset));
    setDeviceDetailsError(undefined);
    setIsLoadingDeviceDetails(true);
    try {
      const response = await apiRequest<{ groups: Array<{ assetId: string; details: InstalledDeviceDetail[] }> }>(
        propertyApiPath(propertyId, `assets/${encodeURIComponent(assetId)}/device-details`),
      );
      const detailsByAsset = new Map(response.groups.map((group) => [group.assetId, group.details]));
      setDraft((current) => current?.id === assetId ? {
        ...current,
        installedProduct: { ...current.installedProduct, deviceDetails: detailsByAsset.get(assetId) ?? [] },
        lightSources: current.lightSources.map((source) => ({
          ...source,
          deviceDetails: detailsByAsset.get(source.id) ?? [],
        })),
      } : current);
    } catch (error) {
      setDeviceDetailsError(error instanceof Error ? error.message : "Private setup details could not be loaded.");
    } finally {
      setIsLoadingDeviceDetails(false);
    }
  }

  async function saveAsset(value: InventoryAssetDraft) {
    setIsSaving(true);
    setSaveError(undefined);
    try {
      const input = createInput(value);
      const response = value.id && value.revision
        ? await apiMutation<{ item: { id: string; revision: number } }>(
            propertyApiPath(propertyId, `assets/${encodeURIComponent(value.id)}`),
            "PATCH",
            (() => {
              const { kind, ...update } = input;
              void kind;
              return { ...update, requestId: `asset-update:${crypto.randomUUID()}`, revision: value.revision };
            })(),
          )
        : await apiMutation<{ item: { assetId: string; permanentCode: string } }, ReturnType<typeof createInput>>(
            propertyApiPath(propertyId, "assets"),
            "POST",
            input,
          );
      const assetId = value.id ?? ("assetId" in response.item ? response.item.assetId : response.item.id);
      setDraft(null);
      resource.reload();
      selection.select({ kind: value.kind, id: assetId });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The record could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveAsset() {
    if (!draft?.id || !draft.revision || isSaving) return;
    if (!window.confirm(`Archive ${draft.displayName}? Its permanent ID and history will be preserved.`)) return;
    setIsSaving(true);
    setSaveError(undefined);
    try {
      await apiMutation(
        propertyApiPath(propertyId, `assets/${encodeURIComponent(draft.id)}`),
        "PATCH",
        { requestId: `asset-archive:${crypto.randomUUID()}`, revision: draft.revision, lifecycleState: "archived" },
      );
      setDraft(null);
      selection.clear({ replace: true });
      resource.reload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The record could not be archived.");
    } finally {
      setIsSaving(false);
    }
  }

  if (resource.status === "loading" && !data) {
    return <RouteFrame><RouteLoading label="Loading inventory…" /></RouteFrame>;
  }
  if (resource.status === "error" && !data) {
    return <RouteFrame><RouteError error={resource.error} onRetry={resource.reload} /></RouteFrame>;
  }

  return (
    <RouteFrame>
      {resource.status === "error" ? (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
          Showing the last loaded inventory. Refresh failed: {resource.error.message}
        </div>
      ) : null}
      {assets.length ? (
        <InventoryList
          assets={assets}
          filters={filters}
          locationOptions={locationOptions}
          onCreateAsset={() => setDraft({ ...EMPTY_ASSET_DRAFT, installedProduct: {}, lightSources: [], tags: [], breakerIds: [] })}
          onFiltersChange={setFilters}
          onEditAsset={(assetId) => void editAsset(assetId)}
          onSelectAsset={(assetId) => {
            const asset = assets.find((candidate) => candidate.id === assetId);
            selection.select({ kind: asset?.kind ?? "device", id: assetId });
          }}
          selectedAssetId={selection.selection?.id}
        />
      ) : (
        <EmptyState
          action={
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setDraft({ ...EMPTY_ASSET_DRAFT, installedProduct: {}, lightSources: [], tags: [], breakerIds: [] })}
              type="button"
            >
              <Plus aria-hidden="true" className="size-4" /> Add the first record
            </button>
          }
          className="min-h-[28rem] bg-white"
          description="Begin with a box, switch, receptacle, fixture, appliance, or junction. Panels and cabling have guided setup flows. Unknown details can remain unknown."
          title="This property’s inventory is empty"
        />
      )}

      <Dialog
        description="Unknown values are valid. This creates property-scoped data and never changes another house."
        isOpen={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open && !isSaving) setDraft(null);
        }}
        size="large"
        title={draft?.id ? "Edit inventory record" : "Add inventory record"}
      >
        {draft ? (
          <AssetEditor
            allowedKinds={CREATABLE_ASSET_KINDS}
            boxOptions={boxOptions}
            breakerOptions={data?.breakerOptions ?? data?.options?.breakers ?? []}
            draft={draft}
            error={saveError}
            deviceDetailsError={deviceDetailsError}
            isLoadingDeviceDetails={isLoadingDeviceDetails}
            isSaving={isSaving}
            locationOptions={locationOptions}
            onCancel={() => setDraft(null)}
            onArchive={draft.id ? () => void archiveAsset() : undefined}
            onChange={setDraft}
            onSave={(next) => void saveAsset(next)}
          />
        ) : null}
      </Dialog>
    </RouteFrame>
  );
}
