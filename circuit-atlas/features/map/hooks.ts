"use client";

import { useCallback, useMemo, useState } from "react";
import {
  getActiveFloorPlanFilterCount,
  matchesFloorPlanFilters,
  normalizeFloorPlanViewport,
  zoomFloorPlanAt,
} from "./geometry";
import type {
  FloorPlanFilters,
  FloorPlanPlacement,
  FloorPlanViewport,
} from "./types";

export interface FloorPlanFilterControls {
  filters: FloorPlanFilters;
  activeFilterCount: number;
  setFilters: (filters: FloorPlanFilters) => void;
  updateFilters: (patch: Partial<FloorPlanFilters>) => void;
  resetFilters: () => void;
}

export function useFloorPlanFilters(
  initialFilters: FloorPlanFilters = {},
): FloorPlanFilterControls {
  const [filters, setFilters] = useState<FloorPlanFilters>(initialFilters);
  const updateFilters = useCallback((patch: Partial<FloorPlanFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);
  const resetFilters = useCallback(() => setFilters({}), []);

  return {
    filters,
    activeFilterCount: getActiveFloorPlanFilterCount(filters),
    setFilters,
    updateFilters,
    resetFilters,
  };
}

export function useFilteredFloorPlanPlacements<TData>(
  placements: readonly FloorPlanPlacement<TData>[],
  filters?: FloorPlanFilters,
  predicate?: (placement: FloorPlanPlacement<TData>) => boolean,
): readonly FloorPlanPlacement<TData>[] {
  return useMemo(
    () =>
      placements.filter(
        (placement) => matchesFloorPlanFilters(placement, filters) && (predicate?.(placement) ?? true),
      ),
    [filters, placements, predicate],
  );
}

export interface UseFloorPlanViewportOptions {
  value?: FloorPlanViewport;
  defaultValue?: FloorPlanViewport;
  onChange?: (viewport: FloorPlanViewport) => void;
  minimumZoom?: number;
  maximumZoom?: number;
}

export interface FloorPlanViewportControls {
  viewport: FloorPlanViewport;
  setViewport: (
    next:
      | FloorPlanViewport
      | ((current: FloorPlanViewport) => FloorPlanViewport),
  ) => void;
  zoomAt: (anchorX: number, anchorY: number, nextZoom: number) => void;
  zoomBy: (factor: number) => void;
  panBy: (deltaX: number, deltaY: number) => void;
  reset: () => void;
}

const FIT_VIEWPORT: FloorPlanViewport = { zoom: 1, centerX: 0.5, centerY: 0.5 };

export function useFloorPlanViewport({
  value,
  defaultValue = FIT_VIEWPORT,
  onChange,
  minimumZoom = 1,
  maximumZoom = 8,
}: UseFloorPlanViewportOptions = {}): FloorPlanViewportControls {
  const [internalViewport, setInternalViewport] = useState(() =>
    normalizeFloorPlanViewport(defaultValue, minimumZoom, maximumZoom),
  );
  const viewport = normalizeFloorPlanViewport(
    value ?? internalViewport,
    minimumZoom,
    maximumZoom,
  );

  const setViewport = useCallback(
    (
      next:
        | FloorPlanViewport
        | ((current: FloorPlanViewport) => FloorPlanViewport),
    ) => {
      const resolved = normalizeFloorPlanViewport(
        typeof next === "function" ? next(viewport) : next,
        minimumZoom,
        maximumZoom,
      );
      if (value === undefined) setInternalViewport(resolved);
      onChange?.(resolved);
    },
    [maximumZoom, minimumZoom, onChange, value, viewport],
  );

  const zoomAt = useCallback(
    (anchorX: number, anchorY: number, nextZoom: number) =>
      setViewport((current) =>
        zoomFloorPlanAt(
          current,
          anchorX,
          anchorY,
          nextZoom,
          minimumZoom,
          maximumZoom,
        ),
      ),
    [maximumZoom, minimumZoom, setViewport],
  );

  const zoomBy = useCallback(
    (factor: number) => zoomAt(viewport.centerX, viewport.centerY, viewport.zoom * factor),
    [viewport, zoomAt],
  );

  const panBy = useCallback(
    (deltaX: number, deltaY: number) =>
      setViewport((current) => ({
        ...current,
        centerX: current.centerX + deltaX,
        centerY: current.centerY + deltaY,
      })),
    [setViewport],
  );

  const reset = useCallback(() => setViewport(FIT_VIEWPORT), [setViewport]);

  return { viewport, setViewport, zoomAt, zoomBy, panBy, reset };
}
