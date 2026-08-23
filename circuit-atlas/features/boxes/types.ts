/** The side of a box where a cable or raceway is observed to enter. */
export const BOX_ENTRY_SIDES = ["top", "bottom", "left", "right", "back"] as const;

export type BoxEntrySide = (typeof BOX_ENTRY_SIDES)[number];

/**
 * The viewing convention for the physical diagram. Wall boxes are viewed from
 * the finished-room side. Ceiling boxes are viewed from below.
 */
export type BoxViewOrientation = "wall-front" | "ceiling-from-below" | "custom";

export interface BoxMountedDevice {
  id: string;
  assetId: string;
  permanentCode: string;
  label: string;
  kind: string;
  /** One-based gang position, counted left-to-right in the selected view. */
  gangStart: number;
  /** Number of adjacent gangs occupied by this device. */
  gangSpan: number;
  /** Normalized top-to-bottom position available for unusual mounts. */
  verticalPosition?: number;
  rotationDegrees?: number;
  detail?: string;
}

export interface BoxCableReference {
  cableId: string;
  cableEndId: string;
  permanentCode: string;
  label?: string;
  jacketMarking?: string;
}

export interface BoxCableEntry {
  id: string;
  side: BoxEntrySide;
  /** Normalized position along the selected side. */
  offset: number;
  /**
   * Optional SVG-style angle: 0° points right and 90° points toward the
   * diagram bottom. If omitted, the entry points outward from its side.
   */
  approachAngleDegrees?: number;
  knockoutLabel?: string;
  cables: readonly BoxCableReference[];
  detail?: string;
}

export interface BoxPhysicalLayoutModel {
  id: string;
  permanentCode: string;
  label: string;
  gangCount: number;
  orientation: BoxViewOrientation;
  /** Rotation of the orientation marker, not an inferred building bearing. */
  orientationDegrees?: number;
  orientationLabel?: string;
  boxType?: string;
  material?: string;
  width?: string;
  height?: string;
  depth?: string;
  mounts: readonly BoxMountedDevice[];
  cableEntries: readonly BoxCableEntry[];
}

export type BoxDiagramSelection =
  | { kind: "mount"; id: string }
  | { kind: "cable-entry"; id: string };

export type BoxLayoutChange =
  | {
      kind: "box";
      field: "gangCount" | "orientation" | "orientationDegrees";
      id: string;
    }
  | {
      kind: "mount";
      field: "gangStart" | "gangSpan" | "verticalPosition" | "rotationDegrees";
      id: string;
    }
  | {
      kind: "cable-entry";
      field: "side" | "offset" | "approachAngleDegrees";
      id: string;
    };

export type BoxTextEquivalentMode = "visible" | "screen-reader";
