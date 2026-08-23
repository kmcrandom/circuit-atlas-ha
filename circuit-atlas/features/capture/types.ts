import type { InventoryAssetKind } from "@/features/inventory";

export type CaptureStep = "photos" | "gangs" | "cables" | "conductors" | "review";

export type CaptureSaveState = "idle" | "saving" | "saved" | "retryable-error" | "conflict";

export type CapturePhoto = {
  id: string;
  url: string;
  category: "overview" | "close-up" | "label" | "other";
  caption?: string | null;
  uploadState?: "uploading" | "ready" | "failed";
};

export type CaptureGangDevice = {
  id: string;
  assetId?: string | null;
  displayName: string;
  kind: Extract<InventoryAssetKind, "switch" | "receptacle" | "other"> | "unknown";
  gangIndex: number | null;
  gangSpan: number | null;
  rotation: number | null;
  configuration?: string | null;
  smartState: "smart" | "dumb" | "smart-companion" | "wireless-remote" | "unknown";
};

export type CaptureCable = {
  id: string;
  permanentCode?: string | null;
  wiringMethod: "nm-b" | "uf-b" | "mc" | "conduit" | "custom" | "unknown";
  rawJacketMarking?: string | null;
  insulatedConductorCount: number | null;
  equipmentGroundCount: number | null;
  gauge?: string | null;
  endDesignation: "a" | "b" | "unknown";
  entrySide: "top" | "bottom" | "left" | "right" | "back" | "unknown";
  entryOffset: number | null;
  otherEndpointLabel?: string | null;
  certainty: "unknown" | "assumed" | "inferred" | "observed" | "test-verified";
};

export type CaptureConductorEnd<Designation extends "a" | "b" = "a" | "b"> = {
  id: string;
  designation: Designation;
  terminationType: "terminal" | "splice" | "cap-open" | "bond" | "unknown";
  terminationLabel?: string | null;
  destinationLabel?: string | null;
  certainty: "unknown" | "assumed" | "inferred" | "observed" | "test-verified";
};

export type CaptureConductor = {
  id: string;
  permanentCode?: string | null;
  cableId: string | null;
  kind: "cable-core" | "equipment-ground" | "pigtail" | "jumper" | "device-lead" | "standalone" | "unknown";
  observedColor?: string | null;
  reidentification?: string | null;
  gauge?: string | null;
  role?: string | null;
  /** Exactly two independently traceable ends for this conductive segment. */
  ends: [CaptureConductorEnd<"a">, CaptureConductorEnd<"b">];
};

export type CaptureDraft = {
  id: string;
  propertyId: string;
  targetId?: string | null;
  targetLabel: string;
  locationId?: string | null;
  locationLabel?: string | null;
  updatedAt?: string | null;
  box: {
    assetId?: string | null;
    permanentCode?: string | null;
    displayName: string;
    type: string | null;
    material: "plastic" | "metal" | "other" | "unknown";
    gangCount: number | null;
    orientation: "wall-finished-side" | "ceiling-from-below" | "other" | "unknown";
    depth?: string | null;
  };
  photos: CapturePhoto[];
  gangDevices: CaptureGangDevice[];
  cables: CaptureCable[];
  conductors: CaptureConductor[];
  notes: string;
  needsReview: boolean;
};

export type CaptureReviewIssue = {
  id: string;
  label: string;
  step: CaptureStep;
  severity: "info" | "warning" | "conflict";
};
