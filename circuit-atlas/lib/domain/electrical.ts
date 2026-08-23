/**
 * Pure electrical-domain contracts.
 *
 * These types deliberately contain no database or house-specific assumptions.
 * A repository adapter can join subtype rows (for example, terminals) into this
 * graph shape before calling the topology services.
 */

export type PropertyId = string;
export type EntityId = string;

export type Certainty =
  | "unknown"
  | "assumed"
  | "inferred"
  | "visually-observed"
  | "test-verified"
  | "documentation-verified"
  | "conflicting";

export type ElectricalNodeKind =
  | "source"
  | "terminal"
  | "splice"
  | "junction"
  | "open-end"
  | "unknown-end"
  | "bond";

export type TerminalSemanticRole =
  | "LINE"
  | "LOAD"
  | "COMMON"
  | "TRAVELER_1"
  | "TRAVELER_2"
  | "NEUTRAL"
  | "GROUND"
  | "AUX"
  | "DATA"
  | "MANUFACTURER_SPECIFIC"
  | "UNKNOWN";

export interface ElectricalNode {
  id: EntityId;
  propertyId: PropertyId;
  kind: ElectricalNodeKind;
  label?: string;
  containingBoxId?: EntityId;
  containingAssetId?: EntityId;
  ownerAssetId?: EntityId;
  ownerFunctionId?: EntityId;
  terminalRole?: TerminalSemanticRole;
  certainty?: Certainty;
}

export type AssetFunctionKind =
  | "switch-channel"
  | "dimmer-channel"
  | "receptacle-half"
  | "relay-channel"
  | "fixture-light-load"
  | "fan-motor"
  | "lamp-holder"
  | "scene-button"
  | "appliance-load"
  | "sensor-output"
  | "custom";

/** Lightweight pure-domain projection used by presets and topology adapters. */
export interface AssetFunction {
  id: EntityId;
  propertyId: PropertyId;
  assetId: EntityId;
  key: string;
  kind: AssetFunctionKind;
  label: string;
}

export type ConductorKind =
  | "cable-core"
  | "equipment-ground"
  | "pigtail"
  | "jumper"
  | "device-lead"
  | "standalone"
  | "unknown"
  | "custom";

/**
 * Electrical class describes observed use, independently of insulation color.
 * `unknown` remains traversable because an unidentified conductor may carry
 * supply; signal and equipment-ground classes are explicit trace boundaries.
 */
export type ConductorElectricalClass =
  | "power"
  | "neutral"
  | "traveler"
  | "switched-power"
  | "signal"
  | "equipment-ground"
  | "unknown";

export interface Conductor {
  id: EntityId;
  propertyId: PropertyId;
  permanentCode?: string;
  cableId?: EntityId;
  kind: ConductorKind;
  electricalClass?: ConductorElectricalClass;
  observedInsulationColor?: string;
  reidentificationMarking?: string;
  gauge?: string | null;
  material?: string;
  observedRole?: string;
  assignedRole?: string;
  certainty?: Certainty;
}

export type EndDesignation = "A" | "B";

export interface ConductorEnd {
  id: EntityId;
  propertyId: PropertyId;
  conductorId: EntityId;
  designation: EndDesignation;
  nodeId: EntityId;
  terminationMethod?: string;
  certainty?: Certainty;
}

export interface Cable {
  id: EntityId;
  propertyId: PropertyId;
  permanentCode?: string;
  wiringMethod?: string;
  rawJacketMarking?: string;
  insulatedConductorCount?: number | null;
  equipmentGroundCount?: number | null;
  gauge?: string | null;
  certainty?: Certainty;
}

export interface CableEnd {
  id: EntityId;
  propertyId: PropertyId;
  cableId: EntityId;
  designation: EndDesignation;
  containingBoxId?: EntityId;
  endpointAssetId?: EntityId;
  certainty?: Certainty;
}

export type InternalConnectionKind =
  | "fixed-feed-through"
  | "conditional-contact"
  | "breakable-tab"
  | "load-impedance"
  | "isolation-boundary"
  | "signal-only"
  | "ground-bond";

export type ConnectionDirectionality =
  | "bidirectional"
  | "forward"
  | "reverse";

export type ConnectionState = "connected" | "disconnected" | "unknown";

export interface InternalConnection {
  id: EntityId;
  propertyId: PropertyId;
  fromNodeId: EntityId;
  toNodeId: EntityId;
  kind: InternalConnectionKind;
  directionality?: ConnectionDirectionality;
  /** Installation state for tabs or configurable feed-throughs. */
  state?: ConnectionState;
  /** Groups mutually coherent contacts on one mechanism. */
  contactStateGroup?: string;
  /** The mechanism state in which this individual contact is closed. */
  contactState?: string;
  certainty?: Certainty;
  label?: string;
}

export interface CircuitSource {
  id: EntityId;
  propertyId: PropertyId;
  circuitId: EntityId;
  breakerPoleId: EntityId;
  nodeId: EntityId;
  legRole?: string;
  /** Related poles/circuits may share a source group without a conflict warning. */
  sourceGroupId?: EntityId;
  label?: string;
  certainty?: Certainty;
}

export type TraceGapStatus = "unresolved" | "assumed" | "abandoned" | "resolved";

export interface TraceGap {
  id: EntityId;
  propertyId: PropertyId;
  fromNodeId?: EntityId;
  toNodeId?: EntityId;
  fromAssetId?: EntityId;
  toAssetId?: EntityId;
  status: TraceGapStatus;
  label?: string;
  certainty?: Certainty;
}

export interface ContactStateGroup {
  id: EntityId;
  propertyId: PropertyId;
  ownerAssetId?: EntityId;
  role?: "endpoint" | "intermediate" | "custom";
  expectedStateCount?: number;
  terminalNodeIds?: readonly EntityId[];
}

export type ControlRole = "controller" | "companion" | "controlled-load";

export type ControlMethod =
  | "mechanical-traveler"
  | "wired-auxiliary-data"
  | "hardwired-relay"
  | "wireless-direct"
  | "hub-app"
  | "scene-automation"
  | "custom";

export interface ControlGroup {
  id: EntityId;
  propertyId: PropertyId;
  label?: string;
}

export interface ControlMember {
  id: EntityId;
  propertyId: PropertyId;
  controlGroupId: EntityId;
  assetFunctionId: EntityId;
  role: ControlRole;
  method: ControlMethod;
  sortOrder?: number;
}

export interface ControlLink {
  id: EntityId;
  propertyId: PropertyId;
  controlGroupId: EntityId;
  fromFunctionId: EntityId;
  toFunctionId: EntityId;
  method: ControlMethod;
  certainty?: Certainty;
}

/**
 * Shared-neutral membership is metadata, not an electrical shortcut. The
 * actual neutral continuity remains represented by conductors and nodes.
 */
export interface SharedNeutralGroup {
  id: EntityId;
  propertyId: PropertyId;
  label?: string;
  certainty?: Certainty;
}

export interface SharedNeutralMember {
  id: EntityId;
  propertyId: PropertyId;
  sharedNeutralGroupId: EntityId;
  circuitId?: EntityId;
  conductorId?: EntityId;
  role?: string;
}

/** A feeder relates panels; it does not by itself create graph continuity. */
export interface PanelFeeder {
  id: EntityId;
  propertyId: PropertyId;
  upstreamCircuitId: EntityId;
  downstreamPanelAssetId: EntityId;
}

export type AssertionTargetKind =
  | "asset"
  | "asset-function"
  | "box"
  | "cable"
  | "conductor"
  | "node";

export interface AssertionTarget {
  kind: AssertionTargetKind;
  id: EntityId;
}

export interface AssetCircuitAssertion {
  id: EntityId;
  propertyId: PropertyId;
  target: AssertionTarget;
  circuitId: EntityId;
  breakerPoleId?: EntityId;
  status?: "active" | "retracted";
  /** Additive assertions need not enumerate every source; exclusive ones do. */
  scope?: "additive" | "exclusive";
  certainty?: Certainty;
  evidenceId?: EntityId;
  note?: string;
}

export interface ElectricalTopology {
  propertyId: PropertyId;
  nodes: readonly ElectricalNode[];
  conductors: readonly Conductor[];
  conductorEnds: readonly ConductorEnd[];
  internalConnections: readonly InternalConnection[];
  sources: readonly CircuitSource[];
  cables?: readonly Cable[];
  cableEnds?: readonly CableEnd[];
  traceGaps?: readonly TraceGap[];
  assertions?: readonly AssetCircuitAssertion[];
  contactStateGroups?: readonly ContactStateGroup[];
  assetFunctions?: readonly AssetFunction[];
  controlGroups?: readonly ControlGroup[];
  controlMembers?: readonly ControlMember[];
  controlLinks?: readonly ControlLink[];
  sharedNeutralGroups?: readonly SharedNeutralGroup[];
  sharedNeutralMembers?: readonly SharedNeutralMember[];
  panelFeeders?: readonly PanelFeeder[];
}

export type TraceRoot =
  | { kind: "node"; id: EntityId }
  | { kind: "breaker-pole"; id: EntityId }
  | { kind: "circuit"; id: EntityId }
  | { kind: "asset"; id: EntityId }
  | { kind: "asset-function"; id: EntityId }
  | { kind: "box"; id: EntityId }
  | { kind: "cable"; id: EntityId }
  | { kind: "conductor"; id: EntityId };
