import type {
  BoxCableEntry,
  BoxEntrySide,
  BoxMountedDevice,
  BoxPhysicalLayoutModel,
} from "./types";

export interface BoxDiagramGeometry {
  viewBoxWidth: number;
  viewBoxHeight: number;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  gangWidth: number;
}

export interface DiagramPoint {
  x: number;
  y: number;
}

const GANG_WIDTH = 112;
const BOX_HEIGHT = 224;
const HORIZONTAL_MARGIN = 68;
const TOP_MARGIN = 62;

export function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampNormalized(value: number): number {
  return clamp(value, 0, 1);
}

export function normalizeGangCount(gangCount: number): number {
  if (!Number.isFinite(gangCount)) return 1;
  return Math.max(1, Math.round(gangCount));
}

export function normalizeRotation(rotationDegrees: number | undefined): number {
  if (!Number.isFinite(rotationDegrees)) return 0;
  const normalized = (rotationDegrees as number) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function getBoxDiagramGeometry(gangCount: number): BoxDiagramGeometry {
  const normalizedGangCount = normalizeGangCount(gangCount);
  const boxWidth = normalizedGangCount * GANG_WIDTH;

  return {
    viewBoxWidth: boxWidth + HORIZONTAL_MARGIN * 2,
    viewBoxHeight: BOX_HEIGHT + TOP_MARGIN + 76,
    boxX: HORIZONTAL_MARGIN,
    boxY: TOP_MARGIN,
    boxWidth,
    boxHeight: BOX_HEIGHT,
    gangWidth: GANG_WIDTH,
  };
}

export function getEntryPoint(
  entry: Pick<BoxCableEntry, "side" | "offset">,
  geometry: BoxDiagramGeometry,
): DiagramPoint {
  const offset = clampNormalized(entry.offset);
  const { boxX, boxY, boxWidth, boxHeight } = geometry;

  switch (entry.side) {
    case "top":
      return { x: boxX + boxWidth * offset, y: boxY };
    case "bottom":
      return { x: boxX + boxWidth * offset, y: boxY + boxHeight };
    case "left":
      return { x: boxX, y: boxY + boxHeight * offset };
    case "right":
      return { x: boxX + boxWidth, y: boxY + boxHeight * offset };
    case "back":
      return { x: boxX + boxWidth * offset, y: boxY + boxHeight * 0.5 };
  }
}

export function getDefaultEntryAngle(side: BoxEntrySide): number {
  switch (side) {
    case "top":
      return -90;
    case "bottom":
      return 90;
    case "left":
      return 180;
    case "right":
      return 0;
    case "back":
      return -45;
  }
}

export function getMountRect(
  mount: BoxMountedDevice,
  gangCount: number,
  geometry: BoxDiagramGeometry,
): { x: number; y: number; width: number; height: number } {
  const count = normalizeGangCount(gangCount);
  const span = clamp(Math.round(mount.gangSpan), 1, count);
  const start = clamp(Math.round(mount.gangStart), 1, count - span + 1);
  const height = 132;
  const inset = 10;
  const usableVerticalSpace = geometry.boxHeight - height - inset * 2;
  const verticalPosition = clampNormalized(mount.verticalPosition ?? 0.5);

  return {
    x: geometry.boxX + (start - 1) * geometry.gangWidth + inset,
    y: geometry.boxY + inset + usableVerticalSpace * verticalPosition,
    width: span * geometry.gangWidth - inset * 2,
    height,
  };
}

export function getGangRangeLabel(mount: BoxMountedDevice): string {
  const start = Math.max(1, Math.round(mount.gangStart));
  const span = Math.max(1, Math.round(mount.gangSpan));
  return span === 1 ? `Gang ${start}` : `Gangs ${start}–${start + span - 1}`;
}

export function getBoxLayoutWarnings(model: BoxPhysicalLayoutModel): string[] {
  const warnings: string[] = [];
  const gangCount = normalizeGangCount(model.gangCount);

  if (model.gangCount !== gangCount) {
    warnings.push("Gang count must be a positive whole number.");
  }

  const occupiedByGang = new Map<number, string>();
  for (const mount of model.mounts) {
    const start = Math.round(mount.gangStart);
    const span = Math.round(mount.gangSpan);
    if (start < 1 || span < 1 || start + span - 1 > gangCount) {
      warnings.push(`${mount.label} is outside the ${gangCount}-gang box.`);
      continue;
    }
    for (let gang = start; gang < start + span; gang += 1) {
      const previous = occupiedByGang.get(gang);
      if (previous) {
        warnings.push(`${mount.label} overlaps ${previous} in gang ${gang}.`);
      } else {
        occupiedByGang.set(gang, mount.label);
      }
    }
  }

  for (const entry of model.cableEntries) {
    if (entry.offset < 0 || entry.offset > 1 || !Number.isFinite(entry.offset)) {
      warnings.push(`Cable entry ${entry.knockoutLabel ?? entry.id} has an invalid offset.`);
    }
  }

  return warnings;
}
