import type { VerificationStatus } from "@/features/circuits";
import type { InstalledDeviceDetail } from "@/lib/device-details";

export type InventoryAssetKind =
  | "panel"
  | "box"
  | "switch"
  | "receptacle"
  | "fixture"
  | "light-source"
  | "appliance"
  | "cable"
  | "junction"
  | "other";

export type SmartState = "smart" | "dumb" | "mixed" | "not-applicable" | "unknown";

export type UpgradeStatus =
  | "keep"
  | "investigate"
  | "candidate"
  | "planned"
  | "purchased"
  | "installed"
  | "verified";

export type BreakerReference = {
  id: string;
  permanentCode: string;
  label: string;
  panelName?: string;
  relationship?: "traced" | "asserted" | "both" | "conflicting";
};

export type InstalledProductDetails = {
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  hardwareRevision?: string | null;
  firmware?: string | null;
  protocol?: string | null;
  ecosystem?: string | null;
  hub?: string | null;
  installationDate?: string | null;
  deviceDetails?: InstalledDeviceDetail[];
};

export type LightSourceDetails = {
  id: string;
  holderLabel: string;
  sourceType: "replaceable" | "integrated" | "unknown";
  smartState: SmartState;
  baseType?: string | null;
  shape?: string | null;
  technology?: string | null;
  wattage?: number | null;
  lumens?: number | null;
  colorTemperature?: string | null;
  dimmable?: boolean | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  hardwareRevision?: string | null;
  firmware?: string | null;
  protocol?: string | null;
  ecosystem?: string | null;
  hub?: string | null;
  deviceDetails?: InstalledDeviceDetail[];
};

export type InventoryAsset = {
  id: string;
  permanentCode: string;
  displayName: string;
  kind: InventoryAssetKind;
  subtype?: string | null;
  locationId?: string | null;
  locatorLabel?: string | null;
  locationLabel?: string | null;
  boxLabel?: string | null;
  boxId?: string | null;
  gangPosition?: string | null;
  verification: VerificationStatus;
  smartState: SmartState;
  operationalStatus?: "working" | "intermittent" | "not-working" | "unknown";
  lifecycleState?: "active" | "archived";
  breakerReferences: BreakerReference[];
  assertedCircuitIds?: string[];
  switchConfiguration?: InventoryAssetDraft["switchConfiguration"];
  receptacleConfiguration?: InventoryAssetDraft["receptacleConfiguration"];
  installedProduct?: InstalledProductDetails | null;
  lightSources?: LightSourceDetails[];
  tags?: string[];
  notes?: string | null;
  upgradeStatus?: UpgradeStatus | null;
  issueCount?: number;
  photoUrl?: string | null;
};

export type LocationOption = {
  id: string;
  label: string;
};

export type InventoryFilterState = {
  query: string;
  kind: InventoryAssetKind | "all";
  smartState: SmartState | "all";
  locationId: string | "all";
  needsReviewOnly: boolean;
};

export type InventoryAssetDraft = {
  id?: string;
  revision?: number;
  permanentCode?: string;
  displayName: string;
  kind: InventoryAssetKind;
  subtype: string | null;
  locationId: string | null;
  locatorLabel: string | null;
  boxId: string | null;
  gangPosition: string | null;
  verification: VerificationStatus;
  smartState: SmartState;
  operationalStatus: "working" | "intermittent" | "not-working" | "unknown";
  breakerIds: string[];
  switchConfiguration?:
    | "single-pole"
    | "multi-way-endpoint"
    | "multi-way-intermediate"
    | "dimmer"
    | "relay"
    | "sensor"
    | "timer"
    | "scene-controller"
    | "custom"
    | "unknown";
  receptacleConfiguration?:
    | "duplex"
    | "split"
    | "switched-half"
    | "gfci"
    | "usb"
    | "custom"
    | "unknown";
  installedProduct: InstalledProductDetails;
  lightSources: LightSourceDetails[];
  tags: string[];
  notes: string;
};

export const EMPTY_ASSET_DRAFT: InventoryAssetDraft = {
  displayName: "",
  kind: "switch",
  subtype: null,
  locationId: null,
  locatorLabel: null,
  boxId: null,
  gangPosition: null,
  verification: "unknown",
  smartState: "unknown",
  operationalStatus: "unknown",
  breakerIds: [],
  switchConfiguration: "unknown",
  installedProduct: {},
  lightSources: [],
  tags: [],
  notes: "",
};
