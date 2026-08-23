export const FLOOR_PLAN_MARKER_KINDS = [
  "panel",
  "box",
  "switch",
  "receptacle",
  "fixture",
  "appliance",
  "junction",
] as const;

export type FloorPlanMarkerKind = (typeof FLOOR_PLAN_MARKER_KINDS)[number];

export type SmartState = "smart" | "dumb" | "companion" | "remote" | "mixed" | "unknown";

export type PlacementConfidence =
  | "unknown"
  | "assumed"
  | "inferred"
  | "observed"
  | "verified"
  | "conflicting";

interface FloorPlanBackgroundBase {
  id: string;
  name: string;
  /** A rendered image URL that is authorized in the current property context. */
  src: string;
  alt: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
  revision?: number;
}

export interface ImageFloorPlanBackground extends FloorPlanBackgroundBase {
  kind: "image";
}

export interface PdfPageFloorPlanBackground extends FloorPlanBackgroundBase {
  kind: "pdf-page";
  /** One-based source PDF page represented by `src`. */
  pageNumber: number;
}

/**
 * PDF pages use a privately rendered page image in `src`, keeping PDF rendering
 * separate from reusable overlay geometry.
 */
export type FloorPlanBackground =
  | ImageFloorPlanBackground
  | PdfPageFloorPlanBackground;

export interface FloorPlanPlacement<TData = unknown> {
  id: string;
  assetId: string;
  permanentCode: string;
  label: string;
  kind: FloorPlanMarkerKind;
  /** Normalized left-to-right position on the plan, from 0 through 1. */
  x: number;
  /** Normalized top-to-bottom position on the plan, from 0 through 1. */
  y: number;
  rotationDegrees?: number;
  roomId?: string;
  roomLabel?: string;
  wallLabel?: string;
  heightLabel?: string;
  circuitIds?: readonly string[];
  breakerIds?: readonly string[];
  smartState?: SmartState;
  upgradeStatus?: string;
  confidence?: PlacementConfidence;
  notes?: string;
  data?: TData;
}

/**
 * A connection contains endpoint IDs only. It deliberately cannot store route
 * vertices, because the line is a schematic relationship rather than a cable
 * route through the building.
 */
export interface FloorPlanConnection {
  id: string;
  fromPlacementId: string;
  toPlacementId: string;
  label?: string;
  kind?: "power" | "control" | "association" | "custom";
}

export interface FloorPlanFilters {
  query?: string;
  roomIds?: readonly string[];
  kinds?: readonly FloorPlanMarkerKind[];
  circuitIds?: readonly string[];
  breakerIds?: readonly string[];
  smartStates?: readonly SmartState[];
  upgradeStatuses?: readonly string[];
  confidences?: readonly PlacementConfidence[];
}

export interface FloorPlanViewport {
  /** 1 shows the whole plan. */
  zoom: number;
  /** Normalized plan coordinate at the viewport center. */
  centerX: number;
  /** Normalized plan coordinate at the viewport center. */
  centerY: number;
}

export interface FloorPlanPlacementChange {
  id: string;
  field: "position" | "rotation";
  source: "drag" | "keyboard" | "numeric";
}

export type FloorPlanTextEquivalentMode = "visible" | "screen-reader";
