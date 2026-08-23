"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  useId,
  useRef,
  useState,
} from "react";
import { withRuntimeBasePath } from "@/lib/client/runtime-path";
import {
  clampPlanCoordinate,
  formatPlacementPercent,
} from "./geometry";
import {
  useFilteredFloorPlanPlacements,
  useFloorPlanViewport,
} from "./hooks";
import type {
  FloorPlanBackground,
  FloorPlanConnection,
  FloorPlanFilters,
  FloorPlanMarkerKind,
  FloorPlanPlacement,
  FloorPlanPlacementChange,
  FloorPlanTextEquivalentMode,
  FloorPlanViewport,
} from "./types";
import styles from "./floor-plan-map.module.css";

export interface FloorPlanMapProps<TData = unknown> {
  background: FloorPlanBackground;
  placements: readonly FloorPlanPlacement<TData>[];
  connections?: readonly FloorPlanConnection[];
  filters?: FloorPlanFilters;
  filterPredicate?: (placement: FloorPlanPlacement<TData>) => boolean;
  selectedPlacementId?: string | null;
  highlightedPlacementIds?: readonly string[];
  onSelectPlacement?: (placementId: string | null) => void;
  onPlacementChange?: (
    nextPlacement: FloorPlanPlacement<TData>,
    change: FloorPlanPlacementChange,
  ) => void;
  editable?: boolean;
  showConnections?: boolean;
  showLabels?: boolean;
  viewport?: FloorPlanViewport;
  defaultViewport?: FloorPlanViewport;
  onViewportChange?: (viewport: FloorPlanViewport) => void;
  minimumZoom?: number;
  maximumZoom?: number;
  textEquivalent?: FloorPlanTextEquivalentMode;
  emptyMessage?: string;
  className?: string;
  onBackgroundError?: (background: FloorPlanBackground) => void;
}

type PointerInteraction<TData> =
  | {
      kind: "pan";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startViewport: FloorPlanViewport;
    }
  | {
      kind: "placement";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      placement: FloorPlanPlacement<TData>;
    };

const KIND_CLASS: Record<FloorPlanMarkerKind, string> = {
  panel: styles.kindPanel,
  box: styles.kindBox,
  switch: styles.kindSwitch,
  receptacle: styles.kindReceptacle,
  fixture: styles.kindFixture,
  appliance: styles.kindAppliance,
  junction: styles.kindJunction,
};

function truncateLabel(label: string, maximum = 24): string {
  return label.length <= maximum ? label : `${label.slice(0, maximum - 1)}…`;
}

function MarkerSymbol({ kind }: { kind: FloorPlanMarkerKind }): ReactNode {
  switch (kind) {
    case "panel":
      return (
        <g aria-hidden="true" className={styles.markerGlyph}>
          <rect height="23" rx="2" width="18" x="-9" y="-11.5" />
          <line x1="-4" x2="-4" y1="-7" y2="7" />
          <line x1="4" x2="4" y1="-7" y2="7" />
          <line x1="-7" x2="7" y1="0" y2="0" />
        </g>
      );
    case "box":
      return <rect aria-hidden="true" className={styles.markerGlyph} height="16" width="16" x="-8" y="-8" />;
    case "switch":
      return (
        <g aria-hidden="true" className={styles.markerGlyph}>
          <circle cx="-7" cy="5" r="2.5" />
          <circle cx="7" cy="-5" r="2.5" />
          <line x1="-5" x2="5" y1="3" y2="-4" />
        </g>
      );
    case "receptacle":
      return (
        <g aria-hidden="true" className={styles.markerGlyph}>
          <circle cx="0" cy="0" r="10" />
          <line x1="-4" x2="-4" y1="-4" y2="2" />
          <line x1="4" x2="4" y1="-4" y2="2" />
          <path d="M -3 6 Q 0 9 3 6" />
        </g>
      );
    case "fixture":
      return (
        <g aria-hidden="true" className={styles.markerGlyph}>
          <circle cx="0" cy="0" r="7" />
          <line x1="0" x2="0" y1="-13" y2="-9" />
          <line x1="0" x2="0" y1="9" y2="13" />
          <line x1="-13" x2="-9" y1="0" y2="0" />
          <line x1="9" x2="13" y1="0" y2="0" />
        </g>
      );
    case "appliance":
      return (
        <g aria-hidden="true" className={styles.markerGlyph}>
          <rect height="20" rx="3" width="20" x="-10" y="-10" />
          <circle cx="0" cy="1" r="6" />
          <line x1="-7" x2="7" y1="-6" y2="-6" />
        </g>
      );
    case "junction":
      return (
        <g aria-hidden="true" className={styles.markerGlyph}>
          <path d="M 0 -10 L 10 0 L 0 10 L -10 0 Z" />
          <line x1="-5" x2="5" y1="0" y2="0" />
          <line x1="0" x2="0" y1="-5" y2="5" />
        </g>
      );
  }
}

function getPlacementAriaLabel<TData>(placement: FloorPlanPlacement<TData>): string {
  const details = [
    placement.label,
    placement.permanentCode,
    placement.kind,
    placement.roomLabel,
    `x ${formatPlacementPercent(placement.x)}`,
    `y ${formatPlacementPercent(placement.y)}`,
    placement.confidence ? `${placement.confidence} confidence` : undefined,
  ];
  return details.filter(Boolean).join(", ");
}

function visibleConnectionClass(kind: FloorPlanConnection["kind"]): string {
  if (kind === "power") return styles.connectionPower;
  if (kind === "control") return styles.connectionControl;
  return "";
}

function backgroundSourceLabel(background: FloorPlanBackground): string {
  return background.kind === "pdf-page"
    ? `PDF page ${background.pageNumber}`
    : "Image";
}

function numberFromInput(value: string, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function FloorPlanTextEquivalent<TData>({
  background,
  placements,
  visibleConnections,
  placementById,
  onSelectPlacement,
  onPlacementChange,
  editable,
  mode,
}: {
  background: FloorPlanBackground;
  placements: readonly FloorPlanPlacement<TData>[];
  visibleConnections: readonly FloorPlanConnection[];
  placementById: ReadonlyMap<string, FloorPlanPlacement<TData>>;
  onSelectPlacement?: (placementId: string | null) => void;
  onPlacementChange?: FloorPlanMapProps<TData>["onPlacementChange"];
  editable: boolean;
  mode: FloorPlanTextEquivalentMode;
}) {
  const hidden = mode === "screen-reader" && !editable;
  return (
    <section
      aria-label={`${background.name} placement list`}
      className={`${styles.summary} ${hidden ? styles.screenReader : ""}`}
    >
      <h3>Items on this plan</h3>
      <p className={styles.summaryIntro}>
        {placements.length} visible placement{placements.length === 1 ? "" : "s"}. Coordinates are
        normalized percentages of the plan, measured from its top-left corner.
      </p>
      {placements.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>{editable ? "Placement editor" : "Placement details"}</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Type</th>
                <th scope="col">Room</th>
                <th scope="col">X</th>
                <th scope="col">Y</th>
                <th scope="col">Rotation</th>
                <th scope="col">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {placements.map((placement) => (
                <tr key={placement.id}>
                  <td>
                    {onSelectPlacement ? (
                      <button
                        className={styles.selectButton}
                        onClick={() => onSelectPlacement(placement.id)}
                        type="button"
                      >
                        {placement.label}
                      </button>
                    ) : (
                      placement.label
                    )}
                    <br />
                    <span className={styles.muted}>{placement.permanentCode}</span>
                  </td>
                  <td>{placement.kind}</td>
                  <td>{placement.roomLabel ?? "Not recorded"}</td>
                  <td>
                    {editable && onPlacementChange ? (
                      <input
                        aria-label={`${placement.label} x position percent`}
                        inputMode="decimal"
                        max="100"
                        min="0"
                        onChange={(event) =>
                          onPlacementChange(
                            {
                              ...placement,
                              x: clampPlanCoordinate(
                                numberFromInput(event.currentTarget.value, placement.x * 100) / 100,
                              ),
                            },
                            { id: placement.id, field: "position", source: "numeric" },
                          )
                        }
                        step="0.1"
                        type="number"
                        value={Math.round(clampPlanCoordinate(placement.x) * 1000) / 10}
                      />
                    ) : (
                      formatPlacementPercent(placement.x)
                    )}
                  </td>
                  <td>
                    {editable && onPlacementChange ? (
                      <input
                        aria-label={`${placement.label} y position percent`}
                        inputMode="decimal"
                        max="100"
                        min="0"
                        onChange={(event) =>
                          onPlacementChange(
                            {
                              ...placement,
                              y: clampPlanCoordinate(
                                numberFromInput(event.currentTarget.value, placement.y * 100) / 100,
                              ),
                            },
                            { id: placement.id, field: "position", source: "numeric" },
                          )
                        }
                        step="0.1"
                        type="number"
                        value={Math.round(clampPlanCoordinate(placement.y) * 1000) / 10}
                      />
                    ) : (
                      formatPlacementPercent(placement.y)
                    )}
                  </td>
                  <td>
                    {editable && onPlacementChange ? (
                      <input
                        aria-label={`${placement.label} rotation degrees`}
                        inputMode="decimal"
                        max="360"
                        min="-360"
                        onChange={(event) =>
                          onPlacementChange(
                            {
                              ...placement,
                              rotationDegrees: numberFromInput(
                                event.currentTarget.value,
                                placement.rotationDegrees ?? 0,
                              ),
                            },
                            { id: placement.id, field: "rotation", source: "numeric" },
                          )
                        }
                        step="1"
                        type="number"
                        value={placement.rotationDegrees ?? 0}
                      />
                    ) : (
                      `${placement.rotationDegrees ?? 0}°`
                    )}
                  </td>
                  <td>{placement.confidence ?? "Not recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.emptyText}>No placements match the current filters.</p>
      )}

      {visibleConnections.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>Shown schematic connections — concealed route unknown</caption>
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">Relationship</th>
              </tr>
            </thead>
            <tbody>
              {visibleConnections.map((connection) => (
                <tr key={connection.id}>
                  <td>{placementById.get(connection.fromPlacementId)?.label ?? "Unknown item"}</td>
                  <td>{placementById.get(connection.toPlacementId)?.label ?? "Unknown item"}</td>
                  <td>{connection.label ?? connection.kind ?? "Connection"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export function FloorPlanMap<TData = unknown>({
  background,
  placements,
  connections = [],
  filters,
  filterPredicate,
  selectedPlacementId,
  highlightedPlacementIds = [],
  onSelectPlacement,
  onPlacementChange,
  editable = false,
  showConnections = false,
  showLabels = true,
  viewport: controlledViewport,
  defaultViewport,
  onViewportChange,
  minimumZoom = 1,
  maximumZoom = 8,
  textEquivalent = "visible",
  emptyMessage = "No items match the current map filters.",
  className,
  onBackgroundError,
}: FloorPlanMapProps<TData>) {
  const titleId = useId();
  const descriptionId = useId();
  const backgroundKey = `${background.id}:${background.revision ?? 0}:${background.src}`;
  const [failedBackgroundKey, setFailedBackgroundKey] = useState<string | null>(null);
  const backgroundFailed = failedBackgroundKey === backgroundKey;
  const pointerInteraction = useRef<PointerInteraction<TData> | null>(null);
  const suppressBackgroundClick = useRef(false);
  const visiblePlacements = useFilteredFloorPlanPlacements(
    placements,
    filters,
    filterPredicate,
  );
  const visiblePlacementIds = new Set(visiblePlacements.map((placement) => placement.id));
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));
  const visibleConnections = showConnections
    ? connections.filter(
        (connection) =>
          visiblePlacementIds.has(connection.fromPlacementId) &&
          visiblePlacementIds.has(connection.toPlacementId),
      )
    : [];
  const highlightedIds = new Set(highlightedPlacementIds);
  const { viewport, setViewport, zoomAt, zoomBy, panBy, reset } = useFloorPlanViewport({
    value: controlledViewport,
    defaultValue: defaultViewport,
    onChange: onViewportChange,
    minimumZoom,
    maximumZoom,
  });
  const visibleWidth = background.intrinsicWidth / viewport.zoom;
  const visibleHeight = background.intrinsicHeight / viewport.zoom;
  const viewBoxX = viewport.centerX * background.intrinsicWidth - visibleWidth / 2;
  const viewBoxY = viewport.centerY * background.intrinsicHeight - visibleHeight / 2;

  const eventToNormalizedPoint = (
    svg: SVGSVGElement,
    clientX: number,
    clientY: number,
  ): { x: number; y: number } => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: viewport.centerX, y: viewport.centerY };
    return {
      x: clampPlanCoordinate(
        (viewBoxX + ((clientX - rect.left) / rect.width) * visibleWidth) /
          background.intrinsicWidth,
      ),
      y: clampPlanCoordinate(
        (viewBoxY + ((clientY - rect.top) / rect.height) * visibleHeight) /
          background.intrinsicHeight,
      ),
    };
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0) return;
    pointerInteraction.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: viewport,
    };
    suppressBackgroundClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleMarkerPointerDown = (
    event: ReactPointerEvent<SVGGElement>,
    placement: FloorPlanPlacement<TData>,
  ): void => {
    event.stopPropagation();
    onSelectPlacement?.(placement.id);
    if (!editable || !onPlacementChange || event.button !== 0) return;
    pointerInteraction.current = {
      kind: "placement",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      placement,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const interaction = pointerInteraction.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const deltaX = event.clientX - interaction.startClientX;
    const deltaY = event.clientY - interaction.startClientY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) suppressBackgroundClick.current = true;

    const normalizedDeltaX = (deltaX / rect.width) / viewport.zoom;
    const normalizedDeltaY = (deltaY / rect.height) / viewport.zoom;
    if (interaction.kind === "pan") {
      setViewport({
        ...interaction.startViewport,
        centerX: interaction.startViewport.centerX - normalizedDeltaX,
        centerY: interaction.startViewport.centerY - normalizedDeltaY,
      });
      return;
    }

    onPlacementChange?.(
      {
        ...interaction.placement,
        x: clampPlanCoordinate(interaction.placement.x + normalizedDeltaX),
        y: clampPlanCoordinate(interaction.placement.y + normalizedDeltaY),
      },
      { id: interaction.placement.id, field: "position", source: "drag" },
    );
  };

  const finishPointerInteraction = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (pointerInteraction.current?.pointerId === event.pointerId) {
      pointerInteraction.current = null;
    }
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>): void => {
    event.preventDefault();
    const anchor = eventToNormalizedPoint(event.currentTarget, event.clientX, event.clientY);
    const factor = Math.exp(-event.deltaY * 0.002);
    zoomAt(anchor.x, anchor.y, viewport.zoom * factor);
  };

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>): void => {
    const panStep = (event.shiftKey ? 0.16 : 0.07) / viewport.zoom;
    if (event.key === "ArrowLeft") panBy(-panStep, 0);
    else if (event.key === "ArrowRight") panBy(panStep, 0);
    else if (event.key === "ArrowUp") panBy(0, -panStep);
    else if (event.key === "ArrowDown") panBy(0, panStep);
    else if (event.key === "+" || event.key === "=") zoomBy(1.25);
    else if (event.key === "-") zoomBy(0.8);
    else if (event.key === "0" || event.key === "Home") reset();
    else return;
    event.preventDefault();
  };

  const handleMarkerKeyDown = (
    event: ReactKeyboardEvent<SVGGElement>,
    placement: FloorPlanPlacement<TData>,
  ): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onSelectPlacement?.(placement.id);
      return;
    }
    if (!editable || !onPlacementChange) return;
    const step = event.shiftKey ? 0.02 : 0.005;
    let x = placement.x;
    let y = placement.y;
    if (event.key === "ArrowLeft") x -= step;
    else if (event.key === "ArrowRight") x += step;
    else if (event.key === "ArrowUp") y -= step;
    else if (event.key === "ArrowDown") y += step;
    else if (event.key === "[") {
      event.preventDefault();
      event.stopPropagation();
      onPlacementChange(
        { ...placement, rotationDegrees: (placement.rotationDegrees ?? 0) - (event.shiftKey ? 15 : 1) },
        { id: placement.id, field: "rotation", source: "keyboard" },
      );
      return;
    } else if (event.key === "]") {
      event.preventDefault();
      event.stopPropagation();
      onPlacementChange(
        { ...placement, rotationDegrees: (placement.rotationDegrees ?? 0) + (event.shiftKey ? 15 : 1) },
        { id: placement.id, field: "rotation", source: "keyboard" },
      );
      return;
    } else return;

    event.preventDefault();
    event.stopPropagation();
    onPlacementChange(
      { ...placement, x: clampPlanCoordinate(x), y: clampPlanCoordinate(y) },
      { id: placement.id, field: "position", source: "keyboard" },
    );
  };

  return (
    <div className={`${styles.root} ${className ?? ""}`}>
      <section className={styles.frame}>
        <header className={styles.toolbar}>
          <div className={styles.titleGroup}>
            <h2>{background.name}</h2>
            <p>{background.alt}</p>
          </div>
          <div aria-label="Map view controls" className={styles.toolbarControls} role="group">
            <button
              aria-label="Zoom out"
              className={styles.toolbarButton}
              onClick={() => zoomBy(0.8)}
              type="button"
            >
              −
            </button>
            <output aria-live="polite" className={styles.zoomOutput}>
              {Math.round(viewport.zoom * 100)}%
            </output>
            <button
              aria-label="Zoom in"
              className={styles.toolbarButton}
              onClick={() => zoomBy(1.25)}
              type="button"
            >
              +
            </button>
            <button className={styles.toolbarButton} onClick={reset} type="button">
              Fit plan
            </button>
          </div>
        </header>

        {showConnections && visibleConnections.length ? (
          <div className={styles.connectionNotice} role="note">
            <span aria-hidden="true" className={styles.dashSample} />
            Connection only — concealed route unknown
          </div>
        ) : null}

        <div
          className={styles.canvasShell}
          style={{ aspectRatio: `${background.intrinsicWidth} / ${background.intrinsicHeight}` }}
        >
          <svg
            aria-describedby={descriptionId}
            aria-labelledby={titleId}
            className={styles.canvas}
            onClick={() => {
              if (!suppressBackgroundClick.current) onSelectPlacement?.(null);
              suppressBackgroundClick.current = false;
            }}
            onKeyDown={handleCanvasKeyDown}
            onPointerCancel={finishPointerInteraction}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerInteraction}
            onWheel={handleWheel}
            role="group"
            tabIndex={0}
            viewBox={`${viewBoxX} ${viewBoxY} ${visibleWidth} ${visibleHeight}`}
          >
            <title id={titleId}>{background.name} interactive floor plan</title>
            <desc id={descriptionId}>
              {background.alt}. {visiblePlacements.length} visible placement
              {visiblePlacements.length === 1 ? "" : "s"}. Use arrow keys to pan, plus and minus to
              zoom, and Home to fit the plan. Each marker has a matching row after the map.
            </desc>
            <image
              className={styles.background}
              height={background.intrinsicHeight}
              href={withRuntimeBasePath(background.src)}
              onError={() => {
                setFailedBackgroundKey(backgroundKey);
                onBackgroundError?.(background);
              }}
              preserveAspectRatio="none"
              width={background.intrinsicWidth}
              x="0"
              y="0"
            />
            <rect
              aria-hidden="true"
              className={styles.backgroundTint}
              height={background.intrinsicHeight}
              width={background.intrinsicWidth}
              x="0"
              y="0"
            />

            {visibleConnections.map((connection) => {
              const from = placementById.get(connection.fromPlacementId);
              const to = placementById.get(connection.toPlacementId);
              if (!from || !to) return null;
              return (
                <line
                  aria-hidden="true"
                  className={`${styles.connectionLine} ${visibleConnectionClass(connection.kind)}`}
                  data-connection-id={connection.id}
                  key={connection.id}
                  x1={clampPlanCoordinate(from.x) * background.intrinsicWidth}
                  x2={clampPlanCoordinate(to.x) * background.intrinsicWidth}
                  y1={clampPlanCoordinate(from.y) * background.intrinsicHeight}
                  y2={clampPlanCoordinate(to.y) * background.intrinsicHeight}
                />
              );
            })}

            {visiblePlacements.map((placement) => {
              const x = clampPlanCoordinate(placement.x) * background.intrinsicWidth;
              const y = clampPlanCoordinate(placement.y) * background.intrinsicHeight;
              const isSelected = placement.id === selectedPlacementId;
              const isHighlighted = highlightedIds.has(placement.id);
              const isUncertain = ["unknown", "assumed", "inferred", "conflicting"].includes(
                placement.confidence ?? "",
              );
              return (
                <g
                  aria-label={getPlacementAriaLabel(placement)}
                  aria-pressed={isSelected}
                  className={`${styles.marker} ${KIND_CLASS[placement.kind]} ${
                    isSelected ? styles.selected : ""
                  } ${isHighlighted ? styles.highlighted : ""} ${isUncertain ? styles.uncertain : ""}`}
                  data-placement-id={placement.id}
                  key={placement.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectPlacement?.(placement.id);
                  }}
                  onKeyDown={(event) => handleMarkerKeyDown(event, placement)}
                  onPointerDown={(event) => handleMarkerPointerDown(event, placement)}
                  role="button"
                  tabIndex={0}
                  transform={`translate(${x} ${y}) scale(${1 / viewport.zoom}) rotate(${
                    placement.rotationDegrees ?? 0
                  })`}
                >
                  <circle className={styles.selectionRing} cx="0" cy="0" r="19" />
                  <circle className={styles.markerBody} cx="0" cy="0" r="15" />
                  <MarkerSymbol kind={placement.kind} />
                  {placement.smartState === "smart" ? (
                    <circle aria-hidden="true" className={styles.smartDot} cx="11" cy="-11" r="4" />
                  ) : null}
                  {showLabels ? (
                    <text aria-hidden="true" className={styles.markerLabel} x="0" y="30">
                      {truncateLabel(placement.label)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {!visiblePlacements.length && !backgroundFailed ? (
            <div className={styles.emptyOverlay}>{emptyMessage}</div>
          ) : null}
          {backgroundFailed ? (
            <div className={styles.errorOverlay} role="alert">
              The floor-plan background could not be displayed. Placement coordinates are still listed
              below.
            </div>
          ) : null}
        </div>

        <footer className={styles.footer}>
          <span>
            {visiblePlacements.length} of {placements.length} item
            {placements.length === 1 ? "" : "s"} shown
          </span>
          <span className={styles.sourceBadge}>{backgroundSourceLabel(background)}</span>
          <span>{editable ? "Drag a marker or use its row to place it precisely." : "Select a marker for details."}</span>
        </footer>
      </section>

      <FloorPlanTextEquivalent
        background={background}
        editable={editable}
        mode={textEquivalent}
        onPlacementChange={onPlacementChange}
        onSelectPlacement={onSelectPlacement}
        placementById={placementById}
        placements={visiblePlacements}
        visibleConnections={visibleConnections}
      />
    </div>
  );
}
