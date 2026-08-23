import type {
  Certainty,
  ElectricalTopology,
  TraceGap,
  TraceRoot,
} from "../domain/electrical";
import { combineCertainty } from "./certainty";
import {
  buildTopologyGraph,
  type TopologyEdge,
  type TraceBoundaryReason,
} from "./graph";

export interface ResolvedTraceRoot {
  id: string;
  selector: TraceRoot;
  nodeIds: readonly string[];
  unresolved: boolean;
}

export interface TraceVisit {
  id: string;
  nodeId: string;
  depth: number;
  rootId: string;
  certainty: Certainty;
  predecessorNodeId?: string;
  predecessorEdgeId?: string;
}

export interface TraversedTraceEdge extends TopologyEdge {
  traversedFromNodeId: string;
  traversedToNodeId: string;
  depth: number;
}

export interface TraceStop {
  id: string;
  reason: TraceBoundaryReason;
  atNodeId: string;
  blockedToNodeId?: string;
  viaEdgeId?: string;
  relationshipId?: string;
  depth: number;
  certainty: Certainty;
}

export interface TraceGapHit extends TraceGap {
  reachedFromNodeId?: string;
  unresolvedToNodeId?: string;
  depth?: number;
}

export interface ReachedSource {
  sourceId: string;
  nodeId: string;
  circuitId: string;
  breakerPoleId: string;
  sourceGroupId?: string;
  certainty: Certainty;
  depth: number;
}

export interface TraceDiagnostic {
  code: "UNRESOLVED_ROOT" | "MULTIPLE_SOURCE_GROUPS";
  message: string;
  entityIds: readonly string[];
}

export interface TraceConflict {
  code: "MULTIPLE_SOURCE_GROUPS";
  message: string;
  sourceIds: readonly string[];
  circuitIds: readonly string[];
}

export interface ReachedTopologyEntities {
  nodeIds: readonly string[];
  assetIds: readonly string[];
  assetFunctionIds: readonly string[];
  boxIds: readonly string[];
  conductorIds: readonly string[];
  cableIds: readonly string[];
  sourceIds: readonly string[];
  circuitIds: readonly string[];
  breakerPoleIds: readonly string[];
}

export interface TraceResult {
  propertyId: string;
  roots: readonly ResolvedTraceRoot[];
  visits: readonly TraceVisit[];
  traversedEdges: readonly TraversedTraceEdge[];
  boundaryEdges: readonly TraversedTraceEdge[];
  gaps: readonly TraceGapHit[];
  stops: readonly TraceStop[];
  sources: readonly ReachedSource[];
  reached: ReachedTopologyEntities;
  warnings: readonly TraceDiagnostic[];
  conflicts: readonly TraceConflict[];
}

export interface TracePath {
  rootId: string;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  certainty: Certainty;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function conductorNodeIds(
  topology: ElectricalTopology,
  conductorIds: ReadonlySet<string>,
): string[] {
  return uniqueSorted(
    topology.conductorEnds
      .filter((end) => conductorIds.has(end.conductorId))
      .map((end) => end.nodeId),
  );
}

export function resolveTraceRootNodes(
  topology: ElectricalTopology,
  selector: TraceRoot,
): string[] {
  switch (selector.kind) {
    case "node":
      return topology.nodes.some((node) => node.id === selector.id)
        ? [selector.id]
        : [];
    case "breaker-pole":
      return uniqueSorted(
        topology.sources
          .filter((source) => source.breakerPoleId === selector.id)
          .map((source) => source.nodeId),
      );
    case "circuit":
      return uniqueSorted(
        topology.sources
          .filter((source) => source.circuitId === selector.id)
          .map((source) => source.nodeId),
      );
    case "asset":
      return uniqueSorted(
        topology.nodes
          .filter(
            (node) =>
              node.ownerAssetId === selector.id ||
              node.containingAssetId === selector.id,
          )
          .map((node) => node.id),
      );
    case "asset-function":
      return uniqueSorted(
        topology.nodes
          .filter((node) => node.ownerFunctionId === selector.id)
          .map((node) => node.id),
      );
    case "box":
      return uniqueSorted(
        topology.nodes
          .filter((node) => node.containingBoxId === selector.id)
          .map((node) => node.id),
      );
    case "cable": {
      const conductorIds = new Set(
        topology.conductors
          .filter((conductor) => conductor.cableId === selector.id)
          .map((conductor) => conductor.id),
      );
      return conductorNodeIds(topology, conductorIds);
    }
    case "conductor":
      return conductorNodeIds(topology, new Set([selector.id]));
  }
}

function nodeBoundaryReason(
  kind: ElectricalTopology["nodes"][number]["kind"],
): TraceBoundaryReason | undefined {
  if (kind === "bond") return "ground";
  if (kind === "open-end") return "open-end";
  if (kind === "unknown-end") return "unknown-end";
  return undefined;
}

function rootKey(root: TraceRoot): string {
  return `${root.kind}:${root.id}`;
}

function gapAppliesToRoots(gap: TraceGap, roots: readonly TraceRoot[]): boolean {
  return roots.some(
    (root) =>
      root.kind === "asset" &&
      (root.id === gap.fromAssetId || root.id === gap.toAssetId),
  );
}

function makeReachedEntities(
  topology: ElectricalTopology,
  visits: readonly TraceVisit[],
  traversedEdges: readonly TraversedTraceEdge[],
  sources: readonly ReachedSource[],
): ReachedTopologyEntities {
  const visitedNodeIds = new Set(visits.map((visit) => visit.nodeId));
  const visitedNodes = topology.nodes.filter((node) => visitedNodeIds.has(node.id));
  const conductorIds = new Set(
    traversedEdges.flatMap((edge) =>
      edge.conductorId ? [edge.conductorId] : [],
    ),
  );
  const cableIds = topology.conductors.flatMap((conductor) =>
    conductorIds.has(conductor.id) && conductor.cableId ? [conductor.cableId] : [],
  );

  return {
    nodeIds: visits.map((visit) => visit.nodeId),
    assetIds: uniqueSorted(
      visitedNodes.flatMap((node) =>
        [node.ownerAssetId, node.containingAssetId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ),
    assetFunctionIds: uniqueSorted(
      visitedNodes.flatMap((node) =>
        node.ownerFunctionId ? [node.ownerFunctionId] : [],
      ),
    ),
    boxIds: uniqueSorted(
      visitedNodes.flatMap((node) =>
        node.containingBoxId ? [node.containingBoxId] : [],
      ),
    ),
    conductorIds: uniqueSorted(conductorIds),
    cableIds: uniqueSorted(cableIds),
    sourceIds: uniqueSorted(sources.map((source) => source.sourceId)),
    circuitIds: uniqueSorted(sources.map((source) => source.circuitId)),
    breakerPoleIds: uniqueSorted(sources.map((source) => source.breakerPoleId)),
  };
}

type TraceQueueEntry = {
  nodeId: string;
  rootId: string;
  depth: number;
  certainty: Certainty;
  usedContactGroups: readonly string[];
};

function traversalStateKey(
  nodeId: string,
  usedContactGroups: readonly string[],
): string {
  return `${nodeId}\u0000${usedContactGroups.join("\u0000")}`;
}

function addContactGroup(
  usedContactGroups: readonly string[],
  group: string | undefined,
): readonly string[] | null {
  if (!group) return usedContactGroups;

  // A current path may pass through one closed contact of a mechanism. Taking
  // a second contact from the same state group would incorrectly combine
  // mutually exclusive switch positions (for example, bridging both travelers
  // of one endpoint switch). The group set, rather than an enumeration of all
  // state combinations, keeps arbitrary n-way traces bounded.
  if (usedContactGroups.includes(group)) return null;
  return [...usedContactGroups, group].sort((left, right) =>
    left.localeCompare(right),
  );
}

/**
 * Traces possible supply reachability. Conditional contacts are considered
 * across all valid mechanism states, while each individual path remains state
 * coherent. Blocked connection classes are reported but never crossed.
 */
export function traceTopology(
  topology: ElectricalTopology,
  selectors: readonly TraceRoot[],
): TraceResult {
  const graph = buildTopologyGraph(topology);
  const roots: ResolvedTraceRoot[] = [];
  const warnings: TraceDiagnostic[] = [];
  const seenRootKeys = new Set<string>();

  for (const selector of selectors) {
    const id = rootKey(selector);
    if (seenRootKeys.has(id)) continue;
    seenRootKeys.add(id);
    const nodeIds = resolveTraceRootNodes(topology, selector);
    const root = { id, selector, nodeIds, unresolved: nodeIds.length === 0 };
    roots.push(root);
    if (root.unresolved) {
      warnings.push({
        code: "UNRESOLVED_ROOT",
        message: `No graph nodes resolve from ${selector.kind} ${selector.id}.`,
        entityIds: [selector.id],
      });
    }
  }

  const visitsByNode = new Map<string, TraceVisit>();
  const visits: TraceVisit[] = [];
  const queue: TraceQueueEntry[] = [];
  const seenTraversalStates = new Set<string>();
  for (const root of roots) {
    for (const nodeId of root.nodeIds) {
      const node = graph.nodes.get(nodeId);
      if (!node) continue;
      const stateKey = traversalStateKey(nodeId, []);
      if (!seenTraversalStates.has(stateKey)) {
        seenTraversalStates.add(stateKey);
        queue.push({
          nodeId,
          rootId: root.id,
          depth: 0,
          certainty: node.certainty ?? "unknown",
          usedContactGroups: [],
        });
      }
      if (!visitsByNode.has(nodeId)) {
        const visit: TraceVisit = {
          id: nodeId,
          nodeId,
          depth: 0,
          rootId: root.id,
          certainty: node.certainty ?? "unknown",
        };
        visitsByNode.set(nodeId, visit);
        visits.push(visit);
      }
    }
  }

  const traversedEdges: TraversedTraceEdge[] = [];
  const boundaryEdges: TraversedTraceEdge[] = [];
  const seenTraversedEdges = new Set<string>();
  const seenBoundaryArcs = new Set<string>();
  const stops: TraceStop[] = [];
  const seenStops = new Set<string>();

  const addStop = (stop: TraceStop): void => {
    if (seenStops.has(stop.id)) return;
    seenStops.add(stop.id);
    stops.push(stop);
  };

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const queueEntry = queue[queueIndex];
    const nodeId = queueEntry.nodeId;
    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    const nodeBoundary = nodeBoundaryReason(node.kind);
    if (nodeBoundary) {
      addStop({
        id: `node:${nodeId}:${nodeBoundary}`,
        reason: nodeBoundary,
        atNodeId: nodeId,
        depth: queueEntry.depth,
        certainty: queueEntry.certainty,
      });
      continue;
    }

    for (const arc of graph.adjacency.get(nodeId) ?? []) {
      const edge = graph.edges.get(arc.edgeId);
      if (!edge) continue;
      const edgeVisit: TraversedTraceEdge = {
        ...edge,
        traversedFromNodeId: arc.fromNodeId,
        traversedToNodeId: arc.toNodeId,
        depth: queueEntry.depth + 1,
      };

      if (edge.traversal === "blocked") {
        const boundaryArcKey = `${edge.id}:${arc.fromNodeId}`;
        if (!seenBoundaryArcs.has(boundaryArcKey)) {
          seenBoundaryArcs.add(boundaryArcKey);
          boundaryEdges.push(edgeVisit);
        }
        const reason = edge.boundaryReason ?? "open-connection";
        addStop({
          id: `edge:${edge.id}:${arc.fromNodeId}:${reason}`,
          reason,
          atNodeId: arc.fromNodeId,
          blockedToNodeId: arc.toNodeId,
          viaEdgeId: edge.id,
          relationshipId: edge.relationshipId,
          depth: queueEntry.depth + 1,
          certainty: combineCertainty(queueEntry.certainty, edge.certainty),
        });
        continue;
      }

      const nextContactGroups = addContactGroup(
        queueEntry.usedContactGroups,
        edge.relationshipKind === "conditional-contact"
          ? edge.contactStateGroup
          : undefined,
      );
      if (!nextContactGroups) continue;

      if (!seenTraversedEdges.has(edge.id)) {
        seenTraversedEdges.add(edge.id);
        traversedEdges.push(edgeVisit);
      }

      const destination = graph.nodes.get(arc.toNodeId);
      if (!destination) continue;
      const nextCertainty = combineCertainty(
        queueEntry.certainty,
        edge.certainty,
        destination.certainty,
      );
      const nextStateKey = traversalStateKey(
        arc.toNodeId,
        nextContactGroups,
      );
      if (!seenTraversalStates.has(nextStateKey)) {
        seenTraversalStates.add(nextStateKey);
        queue.push({
          nodeId: arc.toNodeId,
          rootId: queueEntry.rootId,
          depth: queueEntry.depth + 1,
          certainty: nextCertainty,
          usedContactGroups: nextContactGroups,
        });
      }
      if (!visitsByNode.has(arc.toNodeId)) {
        const nextVisit: TraceVisit = {
          id: arc.toNodeId,
          nodeId: arc.toNodeId,
          depth: queueEntry.depth + 1,
          rootId: queueEntry.rootId,
          certainty: nextCertainty,
          predecessorNodeId: nodeId,
          predecessorEdgeId: edge.id,
        };
        visitsByNode.set(arc.toNodeId, nextVisit);
        visits.push(nextVisit);
      }
    }
  }

  const gaps: TraceGapHit[] = [];
  for (const gap of topology.traceGaps ?? []) {
    if (gap.status === "resolved") continue;
    const fromVisit = gap.fromNodeId
      ? visitsByNode.get(gap.fromNodeId)
      : undefined;
    const toVisit = gap.toNodeId ? visitsByNode.get(gap.toNodeId) : undefined;
    const reachedVisit =
      fromVisit && toVisit
        ? fromVisit.depth <= toVisit.depth
          ? fromVisit
          : toVisit
        : fromVisit ?? toVisit;
    if (!reachedVisit && !gapAppliesToRoots(gap, selectors)) continue;

    const reachedFromNodeId = reachedVisit?.nodeId;
    const unresolvedToNodeId =
      reachedFromNodeId === gap.fromNodeId ? gap.toNodeId : gap.fromNodeId;
    gaps.push({
      ...gap,
      reachedFromNodeId,
      unresolvedToNodeId,
      depth: reachedVisit?.depth,
    });
    if (reachedVisit) {
      addStop({
        id: `gap:${gap.id}:${reachedVisit.nodeId}`,
        reason: "unknown-gap",
        atNodeId: reachedVisit.nodeId,
        blockedToNodeId: unresolvedToNodeId,
        relationshipId: gap.id,
        depth: reachedVisit.depth,
        certainty: combineCertainty(reachedVisit.certainty, gap.certainty),
      });
    }
  }

  const sources: ReachedSource[] = topology.sources
    .flatMap((source) => {
      const visit = visitsByNode.get(source.nodeId);
      return visit
        ? [
            {
              sourceId: source.id,
              nodeId: source.nodeId,
              circuitId: source.circuitId,
              breakerPoleId: source.breakerPoleId,
              sourceGroupId: source.sourceGroupId,
              certainty: combineCertainty(visit.certainty, source.certainty),
              depth: visit.depth,
            } satisfies ReachedSource,
          ]
        : [];
    })
    .sort(
      (left, right) =>
        left.depth - right.depth || left.sourceId.localeCompare(right.sourceId),
    );

  const sourceGroupKeys = uniqueSorted(
    sources.map((source) => source.sourceGroupId ?? source.circuitId),
  );
  const conflicts: TraceConflict[] = [];
  if (sourceGroupKeys.length > 1) {
    const sourceIds = uniqueSorted(sources.map((source) => source.sourceId));
    const circuitIds = uniqueSorted(sources.map((source) => source.circuitId));
    const message = `Trace reaches ${sourceGroupKeys.length} unrelated source groups.`;
    conflicts.push({
      code: "MULTIPLE_SOURCE_GROUPS",
      message,
      sourceIds,
      circuitIds,
    });
    warnings.push({
      code: "MULTIPLE_SOURCE_GROUPS",
      message,
      entityIds: sourceIds,
    });
  }

  return {
    propertyId: topology.propertyId,
    roots,
    visits,
    traversedEdges,
    boundaryEdges,
    gaps,
    stops,
    sources,
    reached: makeReachedEntities(topology, visits, traversedEdges, sources),
    warnings,
    conflicts,
  };
}

export function explainTracePath(
  result: TraceResult,
  nodeId: string,
): TracePath | undefined {
  const visits = new Map(result.visits.map((visit) => [visit.nodeId, visit]));
  const target = visits.get(nodeId);
  if (!target) return undefined;

  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  const seen = new Set<string>();
  let current: TraceVisit | undefined = target;
  while (current && !seen.has(current.nodeId)) {
    seen.add(current.nodeId);
    nodeIds.push(current.nodeId);
    if (current.predecessorEdgeId) edgeIds.push(current.predecessorEdgeId);
    current = current.predecessorNodeId
      ? visits.get(current.predecessorNodeId)
      : undefined;
  }

  nodeIds.reverse();
  edgeIds.reverse();
  return {
    rootId: target.rootId,
    nodeIds,
    edgeIds,
    certainty: target.certainty,
  };
}
