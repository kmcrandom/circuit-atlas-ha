import type {
  Certainty,
  Conductor,
  ElectricalNode,
  ElectricalTopology,
  InternalConnection,
  InternalConnectionKind,
} from "../domain/electrical";
import { combineCertainty } from "./certainty";

export type TraceBoundaryReason =
  | "load"
  | "isolation"
  | "signal"
  | "ground"
  | "open-connection"
  | "open-end"
  | "unknown-end"
  | "unknown-gap";

export const TRAVERSABLE_INTERNAL_CONNECTION_KINDS = [
  "fixed-feed-through",
  "conditional-contact",
  "breakable-tab",
] as const satisfies readonly InternalConnectionKind[];

export const BLOCKED_INTERNAL_CONNECTION_KINDS = [
  "load-impedance",
  "isolation-boundary",
  "signal-only",
  "ground-bond",
] as const satisfies readonly InternalConnectionKind[];

export type GraphRelationshipKind = "conductor" | InternalConnectionKind;

export interface TopologyEdge {
  /** Namespaced, stable ID suitable for UI keys. */
  id: string;
  /** Stable source-record ID without the namespace. */
  relationshipId: string;
  relationshipKind: GraphRelationshipKind;
  fromNodeId: string;
  toNodeId: string;
  directionality: "bidirectional" | "forward" | "reverse";
  certainty: Certainty;
  traversal: "allowed" | "blocked";
  boundaryReason?: TraceBoundaryReason;
  conditional: boolean;
  contactStateGroup?: string;
  contactState?: string;
  connectionState?: "connected" | "disconnected" | "unknown";
  conductorId?: string;
  cableId?: string;
}

export interface TopologyArc {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface TopologyGraph {
  propertyId: string;
  nodes: ReadonlyMap<string, ElectricalNode>;
  edges: ReadonlyMap<string, TopologyEdge>;
  adjacency: ReadonlyMap<string, readonly TopologyArc[]>;
}

export interface InternalConnectionClassification {
  traversal: "allowed" | "blocked";
  boundaryReason?: TraceBoundaryReason;
  conditional: boolean;
}

const blockedReasonByKind: Readonly<
  Partial<Record<InternalConnectionKind, TraceBoundaryReason>>
> = {
  "load-impedance": "load",
  "isolation-boundary": "isolation",
  "signal-only": "signal",
  "ground-bond": "ground",
};

export function classifyInternalConnection(
  connection: InternalConnection,
): InternalConnectionClassification {
  const boundaryReason = blockedReasonByKind[connection.kind];
  if (boundaryReason) {
    return { traversal: "blocked", boundaryReason, conditional: false };
  }

  if (connection.state === "disconnected") {
    return {
      traversal: "blocked",
      boundaryReason: "open-connection",
      conditional: connection.kind !== "fixed-feed-through",
    };
  }

  return {
    traversal: "allowed",
    conditional:
      connection.kind === "conditional-contact" ||
      connection.state === "unknown",
  };
}

function classifyConductor(conductor: Conductor): Pick<
  TopologyEdge,
  "traversal" | "boundaryReason"
> {
  if (
    conductor.kind === "equipment-ground" ||
    conductor.electricalClass === "equipment-ground"
  ) {
    return { traversal: "blocked", boundaryReason: "ground" };
  }
  if (conductor.electricalClass === "signal") {
    return { traversal: "blocked", boundaryReason: "signal" };
  }
  return { traversal: "allowed" };
}

function addArc(
  adjacency: Map<string, TopologyArc[]>,
  edgeId: string,
  fromNodeId: string,
  toNodeId: string,
): void {
  const arcs = adjacency.get(fromNodeId) ?? [];
  arcs.push({ edgeId, fromNodeId, toNodeId });
  adjacency.set(fromNodeId, arcs);
}

function addEdge(
  edges: Map<string, TopologyEdge>,
  adjacency: Map<string, TopologyArc[]>,
  edge: TopologyEdge,
): void {
  edges.set(edge.id, edge);
  if (edge.directionality !== "reverse") {
    addArc(adjacency, edge.id, edge.fromNodeId, edge.toNodeId);
  }
  if (edge.directionality !== "forward") {
    addArc(adjacency, edge.id, edge.toNodeId, edge.fromNodeId);
  }
}

/**
 * Builds the adjacency graph from structurally usable records. Invalid or
 * incomplete records are omitted here and reported by `validateTopology`.
 */
export function buildTopologyGraph(topology: ElectricalTopology): TopologyGraph {
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  const edges = new Map<string, TopologyEdge>();
  const adjacency = new Map<string, TopologyArc[]>();

  for (const node of topology.nodes) {
    adjacency.set(node.id, []);
  }

  const endsByConductor = new Map<string, typeof topology.conductorEnds[number][]>();
  for (const end of topology.conductorEnds) {
    const ends = endsByConductor.get(end.conductorId) ?? [];
    ends.push(end);
    endsByConductor.set(end.conductorId, ends);
  }

  for (const conductor of topology.conductors) {
    const ends = endsByConductor.get(conductor.id) ?? [];
    const endA = ends.filter((end) => end.designation === "A");
    const endB = ends.filter((end) => end.designation === "B");
    if (
      ends.length !== 2 ||
      endA.length !== 1 ||
      endB.length !== 1 ||
      !nodes.has(endA[0].nodeId) ||
      !nodes.has(endB[0].nodeId)
    ) {
      continue;
    }

    const classification = classifyConductor(conductor);
    addEdge(edges, adjacency, {
      id: `conductor:${conductor.id}`,
      relationshipId: conductor.id,
      relationshipKind: "conductor",
      fromNodeId: endA[0].nodeId,
      toNodeId: endB[0].nodeId,
      directionality: "bidirectional",
      certainty: combineCertainty(
        conductor.certainty,
        endA[0].certainty,
        endB[0].certainty,
      ),
      traversal: classification.traversal,
      boundaryReason: classification.boundaryReason,
      conditional: false,
      conductorId: conductor.id,
      cableId: conductor.cableId,
    });
  }

  for (const connection of topology.internalConnections) {
    if (!nodes.has(connection.fromNodeId) || !nodes.has(connection.toNodeId)) {
      continue;
    }
    const classification = classifyInternalConnection(connection);
    addEdge(edges, adjacency, {
      id: `internal:${connection.id}`,
      relationshipId: connection.id,
      relationshipKind: connection.kind,
      fromNodeId: connection.fromNodeId,
      toNodeId: connection.toNodeId,
      directionality: connection.directionality ?? "bidirectional",
      certainty: connection.certainty ?? "unknown",
      traversal: classification.traversal,
      boundaryReason: classification.boundaryReason,
      conditional: classification.conditional,
      contactStateGroup: connection.contactStateGroup,
      contactState: connection.contactState,
      connectionState: connection.state,
    });
  }

  for (const arcs of adjacency.values()) {
    arcs.sort((left, right) =>
      left.edgeId.localeCompare(right.edgeId) ||
      left.toNodeId.localeCompare(right.toNodeId),
    );
  }

  return { propertyId: topology.propertyId, nodes, edges, adjacency };
}
