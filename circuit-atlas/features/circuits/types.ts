export type VerificationStatus =
  | "unknown"
  | "assumed"
  | "inferred"
  | "observed"
  | "test-verified"
  | "documentation-verified"
  | "conflicting";

export type RelationshipSource = "graph" | "assertion" | "both" | "conflict";

export type BreakerProtection =
  | "standard"
  | "afci"
  | "gfci"
  | "dual-function"
  | "other"
  | "unknown";

export type BreakerStateRecord = "recorded-on" | "recorded-off" | "unknown";

export type CircuitSummary = {
  id: string;
  permanentCode: string;
  name: string;
  nominalVoltage?: number | null;
  purpose?: string | null;
};

export type BreakerSummary = {
  id: string;
  permanentCode: string;
  label: string;
  panelId: string;
  panelName: string;
  positionLabels: string[];
  amperage?: number | null;
  poles: number;
  protection: BreakerProtection;
  verification: VerificationStatus;
  recordedState?: BreakerStateRecord;
  circuits: CircuitSummary[];
  notes?: string | null;
  issueCount?: number;
  connectedCount?: number;
};

export type PanelPosition = {
  id: string;
  label: string;
  row: number;
  column: string;
  subposition?: string | null;
  breakerId?: string | null;
  poleIndex?: number | null;
};

export type BreakerPanelModel = {
  id: string;
  permanentCode: string;
  name: string;
  role: "main" | "subpanel" | "other";
  columns: string[];
  positions: PanelPosition[];
  voltageDescription?: string | null;
};

export type ConnectedAssetKind =
  | "switch"
  | "receptacle"
  | "fixture"
  | "light-source"
  | "appliance"
  | "box"
  | "cable"
  | "panel"
  | "other";

export type ConnectionRelationship =
  | "directly-supplied"
  | "switched-load"
  | "controller"
  | "downstream-protected"
  | "contained-device"
  | "manually-associated"
  | "unresolved";

export type ConnectedAsset = {
  id: string;
  permanentCode: string;
  name: string;
  kind: ConnectedAssetKind;
  locationLabel?: string | null;
  secondaryLocation?: string | null;
  relationship: ConnectionRelationship;
  source: RelationshipSource;
  verification: VerificationStatus;
  smartState?: "smart" | "dumb" | "mixed" | "unknown";
  traceSummary?: string | null;
  traceHasGap?: boolean;
  conflictMessage?: string | null;
};

export type CircuitSelection = {
  breakerId?: string;
  assetId?: string;
};
