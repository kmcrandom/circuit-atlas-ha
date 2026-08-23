"use client";

import { ImagePlus, Layers3, Map as MapIcon, Plus, Upload } from "lucide-react";
import { AppLink } from "@/lib/client/runtime-path";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/ui";
import {
  FloorPlanMap,
  type FloorPlanBackground,
  type FloorPlanConnection,
  type FloorPlanMarkerKind,
  type FloorPlanPlacement,
} from "@/features/map";
import { useUrlSelection } from "@/features/selection";
import type { InventoryAsset } from "@/features/inventory";
import {
  apiMutation,
  appendQuery,
  propertyApiPath,
  useApiResource,
  usePdfPage,
} from "@/lib/client";

import {
  RouteError,
  RouteFrame,
  RouteHeading,
  RouteLoading,
  secondaryButtonClass,
} from "../route-ui";

type FloorPlanItem = {
  id: string;
  levelId: string;
  name: string;
  pageNumber?: number | null;
  orientationDegrees?: number;
  revision: number;
  backgroundAttachment: null | {
    id: string;
    originalFileName: string;
    mimeType: string;
    downloadUrl: string;
    altText?: string | null;
    width?: number;
    height?: number;
    widthPixels?: number | null;
    heightPixels?: number | null;
  };
};

type FloorPlansResponse = { items: FloorPlanItem[] };
type PlacementView = FloorPlanPlacement<{ revision: number }> & { revision: number };
type PlacementsResponse = { items: PlacementView[]; connections?: FloorPlanConnection[] };
type AssetsResponse = { items: InventoryAsset[] };

function selectionKind(kind: FloorPlanMarkerKind): string {
  return kind === "junction" ? "other" : kind;
}

function background(plan: FloorPlanItem, pdfPreview?: { src: string; width: number; height: number }): FloorPlanBackground | null {
  const attachment = plan.backgroundAttachment;
  if (!attachment) return null;
  const shared = {
    id: plan.id,
    name: plan.name,
    src: attachment.downloadUrl,
    alt: attachment.altText || `${plan.name} floor-plan background`,
    intrinsicWidth: attachment.widthPixels ?? attachment.width ?? 1600,
    intrinsicHeight: attachment.heightPixels ?? attachment.height ?? 1000,
    revision: plan.revision,
  };
  return attachment.mimeType === "application/pdf"
    ? pdfPreview
      ? { ...shared, src: pdfPreview.src, intrinsicWidth: pdfPreview.width, intrinsicHeight: pdfPreview.height, kind: "pdf-page", pageNumber: plan.pageNumber ?? 1 }
      : null
    : { ...shared, kind: "image" };
}

export function MapClient({ propertyId }: { propertyId: string }) {
  const selection = useUrlSelection();
  const plansResource = useApiResource<FloorPlansResponse>(propertyApiPath(propertyId, "floor-plans"));
  const [activePlanId, setActivePlanId] = useState<string>();
  const plans = plansResource.data?.items ?? [];
  const activePlan = plans.find((plan) => plan.id === activePlanId) ?? plans[0];
  const activeAttachment = activePlan?.backgroundAttachment;
  const pdfPreview = usePdfPage(
    activeAttachment?.mimeType === "application/pdf" ? activeAttachment.downloadUrl : null,
    activePlan?.pageNumber ?? 1,
  );
  const placementsResource = useApiResource<PlacementsResponse>(
    activePlan
      ? appendQuery(propertyApiPath(propertyId, "placements"), { floorPlanId: activePlan.id })
      : null,
  );
  const assetsResource = useApiResource<AssetsResponse>(
    activePlan ? propertyApiPath(propertyId, "assets") : null,
  );
  const [assetToPlace, setAssetToPlace] = useState("");
  const [placementError, setPlacementError] = useState<string>();
  const [optimistic, setOptimistic] = useState<{
    scope: string;
    values: Record<string, PlacementView>;
  }>({ scope: "", values: {} });
  const pendingRef = useRef(new Map<string, PlacementView>());
  const timersRef = useRef(new Map<string, number>());
  const revisionRef = useRef(new Map<string, number>());
  const saveChainsRef = useRef(new Map<string, Promise<void>>());

  const mapBackground = activePlan
    ? background(activePlan, pdfPreview.status === "ready" ? pdfPreview : undefined)
    : null;
  const placementScope = `${propertyId}:${activePlan?.id ?? "none"}`;
  const serverPlacements = useMemo(
    () => placementsResource.data?.items ?? [],
    [placementsResource.data],
  );
  const placements = useMemo(
    () => serverPlacements.map((item) => optimistic.scope === placementScope ? optimistic.values[item.id] ?? item : item),
    [optimistic, placementScope, serverPlacements],
  );

  useEffect(() => {
    serverPlacements.forEach((item) => revisionRef.current.set(item.id, item.revision));
  }, [serverPlacements]);

  const persistPlacement = useCallback((next: PlacementView) => {
    const current = saveChainsRef.current.get(next.id) ?? Promise.resolve();
    const job = current
      .catch(() => undefined)
      .then(async () => {
        const revision = revisionRef.current.get(next.id) ?? next.revision;
        const response = await apiMutation<{ item: { revision: number } }>(
          propertyApiPath(propertyId, `placements/${encodeURIComponent(next.id)}`),
          "PATCH",
          {
            requestId: `move-placement:${crypto.randomUUID()}`,
            revision,
            xNormalized: next.x,
            yNormalized: next.y,
            rotationDegrees: next.rotationDegrees ?? 0,
          },
        );
        revisionRef.current.set(next.id, response.item.revision);
        setPlacementError(undefined);
        placementsResource.reload();
      })
      .catch((caught: unknown) => {
        setPlacementError(caught instanceof Error ? caught.message : "The placement could not be saved.");
        placementsResource.reload();
      });
    saveChainsRef.current.set(next.id, job);
  }, [placementsResource, propertyId]);

  const flushPlacement = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    timersRef.current.delete(id);
    const next = pendingRef.current.get(id);
    if (!next) return;
    pendingRef.current.delete(id);
    persistPlacement(next);
  }, [persistPlacement]);

  useEffect(() => {
    const flushAll = () => [...pendingRef.current.keys()].forEach(flushPlacement);
    window.addEventListener("pointerup", flushAll);
    window.addEventListener("pointercancel", flushAll);
    return () => {
      window.removeEventListener("pointerup", flushAll);
      window.removeEventListener("pointercancel", flushAll);
    };
  }, [flushPlacement]);

  function queuePlacement(next: FloorPlanPlacement<{ revision: number }>) {
    const current = placements.find((candidate) => candidate.id === next.id);
    if (!current) return;
    const changed: PlacementView = {
      ...current,
      ...next,
      revision: revisionRef.current.get(next.id) ?? current.revision,
      data: { revision: revisionRef.current.get(next.id) ?? current.revision },
    };
    setOptimistic((state) => ({
      scope: placementScope,
      values: {
        ...(state.scope === placementScope ? state.values : {}),
        [next.id]: changed,
      },
    }));
    pendingRef.current.set(next.id, changed);
    const timer = timersRef.current.get(next.id);
    if (timer) window.clearTimeout(timer);
    timersRef.current.set(next.id, window.setTimeout(() => flushPlacement(next.id), 650));
  }

  async function addPlacement() {
    if (!activePlan || !assetToPlace) return;
    setPlacementError(undefined);
    try {
      await apiMutation(propertyApiPath(propertyId, "placements"), "POST", {
        requestId: `place-asset:${crypto.randomUUID()}`,
        floorPlanId: activePlan.id,
        assetId: assetToPlace,
        xNormalized: 0.5,
        yNormalized: 0.5,
        rotationDegrees: 0,
      });
      setAssetToPlace("");
      placementsResource.reload();
    } catch (caught) {
      setPlacementError(caught instanceof Error ? caught.message : "The record could not be placed.");
    }
  }

  if (plansResource.status === "loading" && !plansResource.data) return <RouteFrame><RouteLoading label="Loading floor plans…" /></RouteFrame>;
  if (plansResource.status === "error" && !plansResource.data) return <RouteFrame><RouteError error={plansResource.error} onRetry={plansResource.reload} /></RouteFrame>;

  return (
    <RouteFrame>
      {plans.length && mapBackground ? (
        <>
          <RouteHeading
            actions={
              <div className="flex flex-wrap gap-2">
              <select
                aria-label="Floor plan"
                className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold"
                onChange={(event) => setActivePlanId(event.target.value)}
                value={activePlan?.id}
              >
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </select>
              <select aria-label="Record to place" className="min-h-10 max-w-64 rounded-xl border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setAssetToPlace(event.target.value)} value={assetToPlace}>
                <option value="">Choose record to place…</option>
                {(assetsResource.data?.items ?? []).filter((asset) => !placements.some((item) => item.assetId === asset.id) && ["panel", "box", "switch", "receptacle", "fixture", "appliance", "junction"].includes(asset.kind)).map((asset) => <option key={asset.id} value={asset.id}>{asset.displayName} · {asset.permanentCode}</option>)}
              </select>
              <button className={secondaryButtonClass} disabled={!assetToPlace} onClick={() => void addPlacement()} type="button"><Plus className="size-4" /> Place</button>
              </div>
            }
            description="Floor-plan positions answer where a record is. Dashed connections are schematic and never claim to show concealed cable routes."
            eyebrow="Spatial view"
            title={activePlan.name}
          />
          {placementsResource.status === "loading" && !placementsResource.data ? (
            <RouteLoading label="Loading placed records…" />
          ) : placementsResource.status === "error" && !placementsResource.data ? (
            <RouteError error={placementsResource.error} onRetry={placementsResource.reload} />
          ) : (
            <>
            {placementError ? <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="alert">{placementError}</div> : null}
            <FloorPlanMap
              background={mapBackground}
              connections={placementsResource.data?.connections ?? []}
              editable
              emptyMessage="No panels, boxes, fixtures, or appliances have been placed on this plan yet."
              filters={{
                breakerIds: typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("breaker")?.split(",") : undefined,
              }}
              onPlacementChange={queuePlacement}
              onSelectPlacement={(placementId) => {
                if (!placementId) return selection.clear({ replace: true });
                const selected = placements.find((candidate) => candidate.id === placementId);
                if (selected) selection.select({ kind: selectionKind(selected.kind), id: selected.assetId });
              }}
              placements={placements}
              selectedPlacementId={placements.find((candidate) => candidate.assetId === selection.selection?.id)?.id}
              showConnections
              showLabels
            />
            </>
          )}
        </>
      ) : activeAttachment?.mimeType === "application/pdf" && pdfPreview.status === "loading" ? (
        <RouteLoading label="Rendering private PDF floor plan…" />
      ) : activeAttachment?.mimeType === "application/pdf" && pdfPreview.status === "error" ? (
        <RouteError error={pdfPreview.error} title="The PDF floor plan could not be rendered" />
      ) : plans.length ? (
        <EmptyState
          action={<AppLink className={secondaryButtonClass} href={`/p/${encodeURIComponent(propertyId)}/settings#floor-plans`}><Upload className="size-4" /> Add a background</AppLink>}
          className="min-h-[28rem] bg-white"
          description="A floor-plan record exists, but it does not yet have a private image or PDF background."
          icon={<ImagePlus className="size-5" />}
          title="Floor-plan background needed"
        />
      ) : (
        <EmptyState
          action={<AppLink className={secondaryButtonClass} href={`/p/${encodeURIComponent(propertyId)}/settings#locations`}><Layers3 className="size-4" /> Set up levels and floor plans</AppLink>}
          className="min-h-[28rem] bg-white"
          description="Create a structure and level, then upload a private image or PDF. Electrical records stay useful even before a plan is added."
          icon={<MapIcon className="size-5" />}
          title="No floor plans yet"
        />
      )}
    </RouteFrame>
  );
}
