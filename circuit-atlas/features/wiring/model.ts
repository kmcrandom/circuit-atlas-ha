/**
 * A deliberately presentation-only contract for wiring views.
 *
 * The server/domain layer is responsible for deciding which relationships are
 * electrically meaningful. These types only describe how already-derived
 * facts should be shown; the diagram never infers electrical continuity.
 */

export type TraceConfidence =
  | "unknown"
  | "assumed"
  | "inferred"
  | "visually-observed"
  | "test-verified"
  | "documentation-verified"
  | "conflicting";

export type TopologyEntityKind =
  | "panel"
  | "breaker"
  | "box"
  | "device"
  | "switch"
  | "receptacle"
  | "fixture"
  | "light-source"
  | "appliance"
  | "cable"
  | "conductor"
  | "terminal"
  | "splice"
  | "open-end"
  | "bond"
  | "control-group"
  | "connection"
  | "gap"
  | "unknown"
  | "custom";

export type TopologyRelationshipKind =
  | "conductor"
  | "fixed-connection"
  | "conditional-contact"
  | "load-boundary"
  | "isolation-boundary"
  | "signal-boundary"
  | "grounding-bonding"
  | "wired-control"
  | "wireless-control"
  | "manual-assertion"
  | "unknown";

export type TopologyDisplayState =
  | "normal"
  | "possible"
  | "gap"
  | "boundary"
  | "conflict";

export type TopologyIssueKind = "gap" | "warning" | "conflict";

export interface TopologySelection {
  /** Stable database/domain identifier used to synchronize other views. */
  entityId: string;
  entityKind: TopologyEntityKind;
  /** Diagram-local ID, useful when one entity has more than one visual role. */
  visualId?: string;
}

export interface TopologyMetadataItem {
  label: string;
  value: string;
}

export interface TopologyVisualNode {
  /** Unique within this visual model. */
  id: string;
  selection: TopologySelection;
  kind: TopologyEntityKind;
  label: string;
  code?: string;
  description?: string;
  location?: string;
  confidence?: TraceConfidence;
  state?: TopologyDisplayState;
  metadata?: readonly TopologyMetadataItem[];
  isRoot?: boolean;
  isSource?: boolean;
  expansion?: {
    expanded: boolean;
    hiddenNeighborCount: number;
  };
}

export interface TopologyVisualEdge {
  /** Unique within this visual model. */
  id: string;
  source: string;
  target: string;
  relationship: TopologyRelationshipKind;
  label: string;
  description?: string;
  confidence?: TraceConfidence;
  state?: TopologyDisplayState;
  /** True only for a meaningfully directed relationship, such as control. */
  directed?: boolean;
  /** Selectable domain relationship, conductor, or assertion represented here. */
  selection?: TopologySelection;
  /** Explicit switch/contact state wording supplied by the domain view model. */
  possibleStateLabel?: string;
}

export interface TopologyIssue {
  id: string;
  kind: TopologyIssueKind;
  title: string;
  detail: string;
  relatedVisualIds?: readonly string[];
  selection?: TopologySelection;
}

export interface TopologyNarrative {
  /** Optional domain-authored opening sentence. */
  overview?: string;
  /** Domain-authored statements are rendered verbatim as separate bullets. */
  statements?: readonly string[];
}

export interface TopologyVisualModel {
  id: string;
  /** Keeps otherwise-generic view data tied to the active property. */
  propertyId: string;
  title: string;
  description?: string;
  focusNodeId?: string;
  /** Explicit source IDs; an empty array means no source is known in this trace. */
  sourceNodeIds: readonly string[];
  nodes: readonly TopologyVisualNode[];
  edges: readonly TopologyVisualEdge[];
  issues?: readonly TopologyIssue[];
  narrative?: TopologyNarrative;
  revision?: string | number;
}

export interface TopologySelectionContext {
  origin: "canvas" | "trace-table" | "issue-list";
}

export type TopologySelectionHandler = (
  selection: TopologySelection | null,
  context: TopologySelectionContext,
) => void;

export function isSameTopologySelection(
  left: TopologySelection | null | undefined,
  right: TopologySelection | null | undefined,
): boolean {
  if (!left || !right) return left === right;

  return (
    left.entityId === right.entityId && left.entityKind === right.entityKind
  );
}

export function selectionForNode(node: TopologyVisualNode): TopologySelection {
  return { ...node.selection, visualId: node.id };
}

export function selectionForEdge(
  edge: TopologyVisualEdge,
): TopologySelection {
  return edge.selection
    ? { ...edge.selection, visualId: edge.id }
    : { entityId: edge.id, entityKind: "connection", visualId: edge.id };
}
