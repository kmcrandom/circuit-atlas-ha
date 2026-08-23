import type {
  FloorPlanBackground,
  FloorPlanFilters,
  FloorPlanPlacement,
  FloorPlanViewport,
} from "./types";

export interface FloorPlanViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampPlanCoordinate(value: number): number {
  // Six decimal places is far finer than a floor-plan pixel while preventing
  // repeated keyboard nudges from accumulating binary floating-point noise.
  return Math.round(clamp(value, 0, 1) * 1_000_000) / 1_000_000;
}

export function normalizeFloorPlanViewport(
  viewport: FloorPlanViewport,
  minimumZoom = 1,
  maximumZoom = 8,
): FloorPlanViewport {
  const minZoom = Math.max(0.1, minimumZoom);
  const maxZoom = Math.max(minZoom, maximumZoom);
  const zoom = clamp(viewport.zoom, minZoom, maxZoom);
  const halfSpan = 0.5 / zoom;

  return {
    zoom,
    centerX: clamp(viewport.centerX, halfSpan, 1 - halfSpan),
    centerY: clamp(viewport.centerY, halfSpan, 1 - halfSpan),
  };
}

export function getFloorPlanViewBox(
  background: Pick<FloorPlanBackground, "intrinsicWidth" | "intrinsicHeight">,
  viewport: FloorPlanViewport,
): FloorPlanViewBox {
  const normalized = normalizeFloorPlanViewport(viewport);
  const width = background.intrinsicWidth / normalized.zoom;
  const height = background.intrinsicHeight / normalized.zoom;

  return {
    x: normalized.centerX * background.intrinsicWidth - width / 2,
    y: normalized.centerY * background.intrinsicHeight - height / 2,
    width,
    height,
  };
}

export function zoomFloorPlanAt(
  viewport: FloorPlanViewport,
  anchorX: number,
  anchorY: number,
  nextZoom: number,
  minimumZoom = 1,
  maximumZoom = 8,
): FloorPlanViewport {
  const current = normalizeFloorPlanViewport(viewport, minimumZoom, maximumZoom);
  const zoom = clamp(nextZoom, Math.max(0.1, minimumZoom), Math.max(minimumZoom, maximumZoom));
  const currentSpan = 1 / current.zoom;
  const currentLeft = current.centerX - currentSpan / 2;
  const currentTop = current.centerY - currentSpan / 2;
  const horizontalRatio = (clampPlanCoordinate(anchorX) - currentLeft) / currentSpan;
  const verticalRatio = (clampPlanCoordinate(anchorY) - currentTop) / currentSpan;
  const nextSpan = 1 / zoom;

  return normalizeFloorPlanViewport(
    {
      zoom,
      centerX: anchorX - horizontalRatio * nextSpan + nextSpan / 2,
      centerY: anchorY - verticalRatio * nextSpan + nextSpan / 2,
    },
    minimumZoom,
    maximumZoom,
  );
}

function matchesOne<T>(actual: T | undefined, requested: readonly T[] | undefined): boolean {
  return !requested?.length || (actual !== undefined && requested.includes(actual));
}

function overlaps(actual: readonly string[] | undefined, requested: readonly string[] | undefined): boolean {
  return !requested?.length || Boolean(actual?.some((value) => requested.includes(value)));
}

export function matchesFloorPlanFilters<TData>(
  placement: FloorPlanPlacement<TData>,
  filters: FloorPlanFilters | undefined,
): boolean {
  if (!filters) return true;

  if (!matchesOne(placement.roomId, filters.roomIds)) return false;
  if (!matchesOne(placement.kind, filters.kinds)) return false;
  if (!overlaps(placement.circuitIds, filters.circuitIds)) return false;
  if (!overlaps(placement.breakerIds, filters.breakerIds)) return false;
  if (!matchesOne(placement.smartState, filters.smartStates)) return false;
  if (!matchesOne(placement.upgradeStatus, filters.upgradeStatuses)) return false;
  if (!matchesOne(placement.confidence, filters.confidences)) return false;

  const query = filters.query?.trim().toLocaleLowerCase();
  if (!query) return true;
  const searchableText = [
    placement.label,
    placement.permanentCode,
    placement.roomLabel,
    placement.wallLabel,
    placement.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return searchableText.includes(query);
}

export function getActiveFloorPlanFilterCount(filters: FloorPlanFilters): number {
  let count = filters.query?.trim() ? 1 : 0;
  const keys: (keyof Omit<FloorPlanFilters, "query">)[] = [
    "roomIds",
    "kinds",
    "circuitIds",
    "breakerIds",
    "smartStates",
    "upgradeStatuses",
    "confidences",
  ];
  for (const key of keys) {
    if (filters[key]?.length) count += 1;
  }
  return count;
}

export function formatPlacementPercent(value: number): string {
  return `${Math.round(clampPlanCoordinate(value) * 1000) / 10}%`;
}
