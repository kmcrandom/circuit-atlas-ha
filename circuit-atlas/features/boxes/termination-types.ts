/**
 * Structured records used by the gang-box termination view and editor.
 *
 * IDs for terminals, splices, open endpoints, and bond points are electrical
 * node IDs. Conductor ends reference those IDs directly, so the component is a
 * view over the persisted topology rather than a second source of wiring truth.
 */

export const BOX_CONDUCTOR_KINDS = [
  "cable-core",
  "equipment-ground",
  "pigtail",
  "jumper",
  "device-lead",
  "standalone",
  "unknown",
  "custom",
] as const;

export type BoxConductorKind = (typeof BOX_CONDUCTOR_KINDS)[number];

export const BOX_TERMINAL_ROLES = [
  "LINE",
  "LOAD",
  "COMMON",
  "TRAVELER_1",
  "TRAVELER_2",
  "NEUTRAL",
  "GROUND",
  "AUX",
  "MANUFACTURER_SPECIFIC",
  "UNKNOWN",
] as const;

export type BoxTerminalRole = (typeof BOX_TERMINAL_ROLES)[number];

export const BOX_OPEN_ENDPOINT_KINDS = [
  "capped",
  "abandoned",
  "unconnected",
  "unknown",
] as const;

export type BoxOpenEndpointKind = (typeof BOX_OPEN_ENDPOINT_KINDS)[number];

export const BOX_TERMINATION_METHODS = [
  "screw",
  "clamp",
  "backstab",
  "wirenut",
  "lever-connector",
  "crimp",
  "solder",
  "lug",
  "integral",
  "open",
  "unknown",
  "custom",
] as const;

export type BoxTerminationMethod = (typeof BOX_TERMINATION_METHODS)[number];

export const BOX_CONDUCTOR_FUNCTIONS = [
  "line",
  "load",
  "switched-line",
  "common",
  "traveler-1",
  "traveler-2",
  "neutral",
  "ground",
  "aux",
  "data",
  "unknown",
  "custom",
] as const;

export type BoxConductorFunction = (typeof BOX_CONDUCTOR_FUNCTIONS)[number];

export const BOX_TERMINATION_CERTAINTIES = [
  "unknown",
  "assumed",
  "inferred",
  "visually-observed",
  "test-verified",
  "documentation-verified",
  "conflicting",
] as const;

export type BoxTerminationCertainty =
  (typeof BOX_TERMINATION_CERTAINTIES)[number];

export interface BoxTerminalRecord {
  /** Electrical node ID. */
  id: string;
  owningAssetId: string;
  assetPermanentCode?: string;
  assetLabel: string;
  terminalKey: string;
  manufacturerLabel?: string;
  semanticRole: BoxTerminalRole;
  terminalGroup?: string;
  notes?: string;
  /** Optimistic-concurrency revision of the backing electrical node. */
  revision?: number;
}

export interface BoxSpliceRecord {
  /** Electrical node ID shared by every conductor end in the splice. */
  id: string;
  label: string;
  connectorType?: string;
  notes?: string;
  /** Optimistic-concurrency revision of the backing electrical node. */
  revision?: number;
}

export interface BoxOpenEndpointRecord {
  /** Electrical node ID used by the conductor end. */
  id: string;
  endpointKind: BoxOpenEndpointKind;
  label?: string;
  description?: string;
  /** Optimistic-concurrency revision of the backing electrical node. */
  revision?: number;
}

export interface BoxBondPointRecord {
  /** Electrical node ID used by equipment-ground conductor ends. */
  id: string;
  label: string;
  ownerLabel?: string;
  description?: string;
  /** Optimistic-concurrency revision of the backing electrical node. */
  revision?: number;
}

export interface BoxConductorRecord {
  id: string;
  permanentCode: string;
  cableId?: string;
  cablePermanentCode?: string;
  kind: BoxConductorKind;
  observedInsulationColor?: string;
  reidentificationMarking?: string;
  /** Assigned electrical function; color alone never determines this value. */
  assignedFunction?: BoxConductorFunction;
  /** Optional by design because it is not always visible or known. */
  gauge?: string | null;
  notes?: string;
  /** Optimistic-concurrency revision of the conductor. */
  revision?: number;
}

export interface BoxConductorEndRecord {
  id: string;
  conductorId: string;
  designation: "A" | "B";
  /** A terminal, splice, open endpoint, or bond point electrical node ID. */
  nodeId?: string | null;
  terminationMethod: BoxTerminationMethod;
  certainty?: BoxTerminationCertainty;
  notes?: string;
  /**
   * Optimistic-concurrency revision of the owning conductor. Both A and B
   * intentionally share this token so either end invalidates a stale edit.
   */
  revision?: number;
}

export interface BoxTerminationModel {
  boxId: string;
  permanentCode: string;
  label: string;
  terminals: readonly BoxTerminalRecord[];
  splices: readonly BoxSpliceRecord[];
  openEndpoints: readonly BoxOpenEndpointRecord[];
  bondPoints: readonly BoxBondPointRecord[];
  conductors: readonly BoxConductorRecord[];
  conductorEnds: readonly BoxConductorEndRecord[];
}

export type BoxTerminationSelection =
  | { kind: "terminal"; id: string }
  | { kind: "splice"; id: string }
  | { kind: "open-end"; id: string }
  | { kind: "bond"; id: string }
  | { kind: "conductor"; id: string }
  | { kind: "conductor-end"; id: string };

export type BoxTerminationAddKind =
  | "terminal"
  | "splice"
  | "open-end"
  | "bond"
  | "conductor"
  | "conductor-end";

export type BoxTerminationChange =
  | {
      kind: "terminal";
      id: string;
      field: "terminalKey" | "manufacturerLabel" | "semanticRole" | "terminalGroup";
    }
  | {
      kind: "splice";
      id: string;
      field: "label" | "connectorType";
    }
  | {
      kind: "open-end";
      id: string;
      field: "endpointKind" | "label" | "description";
    }
  | {
      kind: "bond";
      id: string;
      field: "label" | "description";
    }
  | {
      kind: "conductor";
      id: string;
      field:
        | "kind"
        | "observedInsulationColor"
        | "reidentificationMarking"
        | "assignedFunction"
        | "gauge";
    }
  | {
      kind: "conductor-end";
      id: string;
      field:
        | "nodeId"
        | "terminationMethod"
        | "certainty";
    };
