import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assetCircuitAssertions,
  assets,
  breakerPoles,
  breakers,
  cableEnds,
  cables,
  circuitSources,
  circuits,
  controlMembers,
  assetFunctions,
  conductorEnds,
  conductors,
  electricalNodes,
  internalConnections,
  terminals,
  traceGaps,
} from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import type {
  AssetCircuitAssertion,
  Certainty,
  ConductorElectricalClass,
  ElectricalTopology,
  TraceRoot,
} from "@/lib/domain/electrical";
import { explainTracePath, traceTopology, type TraceResult } from "@/lib/topology/trace";
import { resolveCircuitMembership } from "@/lib/topology/assertions";
import { validateTopology } from "@/lib/validation/topology";
import type { TopologyVisualModel } from "@/features/wiring/model";
import { NotFoundError } from "@/lib/http/responses";
import { requireOwnedProperty } from "./workspaces";

const certaintyMap: Record<string, Certainty> = {
  visually_observed: "visually-observed",
  test_verified: "test-verified",
  documentation_verified: "documentation-verified",
  unknown: "unknown",
  assumed: "assumed",
  inferred: "inferred",
  conflicting: "conflicting",
};

function certainty(value: string | null | undefined): Certainty {
  return certaintyMap[value ?? "unknown"] ?? "unknown";
}

function nodeKind(value: string) {
  if (value === "open_endpoint") return "open-end" as const;
  if (value === "bond_point") return "bond" as const;
  if (value === "custom") return "unknown-end" as const;
  return value as "source" | "terminal" | "splice";
}

function conductorKind(value: string) {
  const mapped: Record<string, ElectricalTopology["conductors"][number]["kind"]> = {
    cable_core: "cable-core",
    cable_equipment_ground: "equipment-ground",
    pigtail: "pigtail",
    jumper: "jumper",
    device_lead: "device-lead",
    standalone_raceway: "standalone",
    unknown: "unknown",
    custom: "custom",
  };
  return mapped[value] ?? "unknown";
}

function electricalClass(role: string | null): ConductorElectricalClass {
  if (role === "neutral") return "neutral";
  if (role === "traveler_1" || role === "traveler_2") return "traveler";
  if (role === "switched_line" || role === "load") return "switched-power";
  if (role === "ground") return "equipment-ground";
  if (role === "data" || role === "aux") return "signal";
  if (role === "line" || role === "common") return "power";
  return "unknown";
}

function internalKind(value: string) {
  const mapped: Record<string, ElectricalTopology["internalConnections"][number]["kind"]> = {
    always_connected: "fixed-feed-through",
    conditional_contact: "conditional-contact",
    breakable_tab: "breakable-tab",
    load_impedance: "load-impedance",
    transformer_isolation: "isolation-boundary",
    electronic_signal_only: "signal-only",
    ground_bond: "ground-bond",
  };
  return mapped[value] ?? "signal-only";
}

export async function loadElectricalTopology(
  identity: RequestIdentity,
  propertyId: string,
): Promise<ElectricalTopology> {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const [
    nodeRows,
    terminalRows,
    conductorRows,
    endRows,
    connectionRows,
    sourceRows,
    cableRows,
    cableEndRows,
    gapRows,
    assertionRows,
    activeAssetRows,
    activeCircuitRows,
    activeBreakerRows,
    allPoleRows,
  ] = await Promise.all([
    db.select().from(electricalNodes).where(and(eq(electricalNodes.propertyId, propertyId), ne(electricalNodes.lifecycleState, "archived"))),
    db.select().from(terminals).where(eq(terminals.propertyId, propertyId)),
    db.select().from(conductors).where(and(eq(conductors.propertyId, propertyId), ne(conductors.lifecycleState, "archived"))),
    db.select().from(conductorEnds).where(eq(conductorEnds.propertyId, propertyId)),
    db.select().from(internalConnections).where(eq(internalConnections.propertyId, propertyId)),
    db.select().from(circuitSources).where(eq(circuitSources.propertyId, propertyId)),
    db.select().from(cables).where(eq(cables.propertyId, propertyId)),
    db.select().from(cableEnds).where(eq(cableEnds.propertyId, propertyId)),
    db.select().from(traceGaps).where(eq(traceGaps.propertyId, propertyId)),
    db.select().from(assetCircuitAssertions).where(eq(assetCircuitAssertions.propertyId, propertyId)),
    db.select({ id: assets.id }).from(assets).where(and(eq(assets.propertyId, propertyId), ne(assets.lifecycleState, "archived"))),
    db.select({ id: circuits.id }).from(circuits).where(and(eq(circuits.propertyId, propertyId), ne(circuits.lifecycleState, "archived"))),
    db.select({ id: breakers.id }).from(breakers).where(and(eq(breakers.propertyId, propertyId), ne(breakers.lifecycleState, "archived"))),
    db.select().from(breakerPoles).where(eq(breakerPoles.propertyId, propertyId)),
  ]);
  const activeAssetIds = new Set(activeAssetRows.map((row) => row.id));
  const activeCircuitIds = new Set(activeCircuitRows.map((row) => row.id));
  const activeBreakerIds = new Set(activeBreakerRows.map((row) => row.id));
  const activePoleIds = new Set(allPoleRows.filter((row) => activeBreakerIds.has(row.breakerId)).map((row) => row.id));
  const activeNodes = nodeRows.filter((row) => (!row.containingAssetId || activeAssetIds.has(row.containingAssetId)) && (!row.containingBoxAssetId || activeAssetIds.has(row.containingBoxAssetId)));
  const activeNodeIds = new Set(activeNodes.map((row) => row.id));
  const activeConductors = conductorRows.filter((row) => !row.cableAssetId || activeAssetIds.has(row.cableAssetId));
  const activeConductorIds = new Set(activeConductors.map((row) => row.id));
  const terminalByNode = new Map(terminalRows.filter((row) => activeNodeIds.has(row.electricalNodeId) && activeAssetIds.has(row.owningAssetId)).map((row) => [row.electricalNodeId, row]));
  return {
    propertyId,
    nodes: activeNodes.map((row) => {
      const terminal = terminalByNode.get(row.id);
      return {
        id: row.id,
        propertyId,
        kind: nodeKind(row.kind),
        label: row.label ?? undefined,
        containingBoxId: row.containingBoxAssetId ?? undefined,
        containingAssetId: row.containingAssetId ?? undefined,
        ownerAssetId: terminal?.owningAssetId,
        ownerFunctionId: terminal?.assetFunctionId ?? undefined,
        certainty: certainty(row.certainty),
      };
    }),
    conductors: activeConductors.map((row) => ({
      id: row.id,
      propertyId,
      permanentCode: row.permanentCode,
      cableId: row.cableAssetId ?? undefined,
      kind: conductorKind(row.kind),
      electricalClass: electricalClass(row.assignedRole ?? row.observedRole),
      observedInsulationColor: row.observedInsulationColor ?? undefined,
      reidentificationMarking: row.reidentificationMarking ?? undefined,
      gauge: row.gauge,
      material: row.material ?? undefined,
      observedRole: row.observedRole ?? undefined,
      assignedRole: row.assignedRole ?? undefined,
    })),
    conductorEnds: endRows.filter((row) => activeConductorIds.has(row.conductorId) && activeNodeIds.has(row.electricalNodeId)).map((row) => ({
      id: row.id,
      propertyId,
      conductorId: row.conductorId,
      designation: row.designation,
      nodeId: row.electricalNodeId,
      terminationMethod: row.terminationMethod,
      certainty: certainty(row.certainty),
    })),
    internalConnections: connectionRows.filter((row) => activeAssetIds.has(row.owningAssetId) && activeNodeIds.has(row.fromNodeId) && activeNodeIds.has(row.toNodeId)).map((row) => ({
      id: row.id,
      propertyId,
      fromNodeId: row.fromNodeId,
      toNodeId: row.toNodeId,
      kind: internalKind(row.connectionType),
      directionality: row.directionality,
      state: row.connectionState,
      contactStateGroup: row.contactStateGroup ?? undefined,
      contactState: row.contactState ?? undefined,
      certainty: certainty(row.certainty),
    })),
    sources: sourceRows
      .filter((row) => row.electricalNodeId && activeNodeIds.has(row.electricalNodeId) && activeCircuitIds.has(row.circuitId) && activePoleIds.has(row.breakerPoleId))
      .map((row) => ({
        id: row.id,
        propertyId,
        circuitId: row.circuitId,
        breakerPoleId: row.breakerPoleId,
        nodeId: row.electricalNodeId as string,
        legRole: row.legRole,
      })),
    cables: cableRows.filter((row) => activeAssetIds.has(row.assetId)).map((row) => ({
      id: row.assetId,
      propertyId,
      wiringMethod: row.wiringMethod,
      rawJacketMarking: row.jacketMarking ?? undefined,
      insulatedConductorCount: row.insulatedConductorCount,
      equipmentGroundCount: row.equipmentGroundCount,
      gauge: row.gauge,
    })),
    cableEnds: cableEndRows.filter((row) => activeAssetIds.has(row.cableAssetId) && (!row.endpointAssetId || activeAssetIds.has(row.endpointAssetId)) && (!row.boxAssetId || activeAssetIds.has(row.boxAssetId))).map((row) => ({
      id: row.id,
      propertyId,
      cableId: row.cableAssetId,
      designation: row.designation,
      containingBoxId: row.boxAssetId ?? undefined,
      endpointAssetId: row.endpointAssetId ?? undefined,
      certainty: certainty(row.certainty),
    })),
    traceGaps: gapRows.map((row) => ({
      id: row.id,
      propertyId,
      fromNodeId: row.fromNodeId ?? undefined,
      toNodeId: row.toNodeId ?? undefined,
      fromAssetId: row.fromAssetId ?? undefined,
      toAssetId: row.toAssetId ?? undefined,
      status: row.status === "resolved" ? "resolved" : row.status === "accepted_unknown" ? "abandoned" : "unresolved",
      label: row.description,
      certainty: certainty(row.certainty),
    })),
    assertions: assertionRows.filter((row) => activeAssetIds.has(row.assetId) && activeCircuitIds.has(row.circuitId)).map((row) => ({
      id: row.id,
      propertyId,
      target: row.assetFunctionId
        ? { kind: "asset-function", id: row.assetFunctionId }
        : { kind: "asset", id: row.assetId },
      circuitId: row.circuitId,
      status: row.status === "active" ? "active" : "retracted",
      certainty: certainty(row.certainty),
      evidenceId: row.evidenceId ?? undefined,
      note: row.notes ?? undefined,
    } satisfies AssetCircuitAssertion)),
  };
}

export function topologyVisualModel(
  topology: ElectricalTopology,
  trace: TraceResult,
  title = "Electrical trace",
): TopologyVisualModel {
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const conductorById = new Map(topology.conductors.map((item) => [item.id, item]));
  const visibleNodeIds = new Set([
    ...trace.visits.map((visit) => visit.nodeId),
    ...trace.boundaryEdges.flatMap((edge) => [edge.traversedFromNodeId, edge.traversedToNodeId]),
  ]);
  const visualNodes = [...visibleNodeIds].map((id) => {
    const node = nodeById.get(id);
    const isSource = trace.sources.some((source) => source.nodeId === id);
    return {
      id: `node:${id}`,
      selection: { entityId: id, entityKind: node?.kind === "splice" ? "splice" as const : node?.kind === "terminal" ? "terminal" as const : node?.kind === "bond" ? "bond" as const : node?.kind === "open-end" ? "open-end" as const : "unknown" as const },
      kind: node?.kind === "splice" ? "splice" as const : node?.kind === "terminal" ? "terminal" as const : node?.kind === "bond" ? "bond" as const : node?.kind === "open-end" ? "open-end" as const : "unknown" as const,
      label: node?.label || id,
      confidence: node?.certainty,
      isRoot: trace.roots.some((root) => root.nodeIds.includes(id)),
      isSource,
    };
  });
  const visualEdge = (edge: TraceResult["traversedEdges"][number], boundary: boolean) => {
    const conductor = edge.conductorId ? conductorById.get(edge.conductorId) : undefined;
    const relationship = edge.boundaryReason === "load" ? "load-boundary" as const
      : edge.boundaryReason === "isolation" ? "isolation-boundary" as const
        : edge.boundaryReason === "signal" ? "signal-boundary" as const
          : edge.boundaryReason === "ground" ? "grounding-bonding" as const
            : edge.relationshipKind === "conductor" ? "conductor" as const
              : edge.relationshipKind === "conditional-contact" ? "conditional-contact" as const
                : "fixed-connection" as const;
    return {
      id: boundary ? `${edge.id}:boundary:${edge.traversedFromNodeId}` : edge.id,
      source: `node:${edge.traversedFromNodeId}`,
      target: `node:${edge.traversedToNodeId}`,
      relationship,
      label: conductor?.permanentCode ?? (boundary && edge.boundaryReason ? `${edge.relationshipKind} · ${edge.boundaryReason}` : edge.relationshipKind),
      confidence: edge.certainty,
      state: boundary ? "boundary" as const : edge.conditional ? "possible" as const : "normal" as const,
      selection: { entityId: edge.relationshipId, entityKind: edge.relationshipKind === "conductor" ? "conductor" as const : "connection" as const },
      possibleStateLabel: edge.contactState,
    };
  };
  const visualEdges = [
    ...trace.traversedEdges.map((edge) => visualEdge(edge, false)),
    ...trace.boundaryEdges.map((edge) => visualEdge(edge, true)),
  ];
  return {
    id: `trace:${trace.roots.map((root) => root.id).join("+") || "empty"}`,
    propertyId: topology.propertyId,
    title,
    sourceNodeIds: trace.sources.map((source) => `node:${source.nodeId}`),
    nodes: visualNodes,
    edges: visualEdges,
    issues: [
      ...trace.gaps.map((gap) => ({ id: gap.id, kind: "gap" as const, title: "Trace gap", detail: gap.label ?? "The next connection is unknown." })),
      ...trace.conflicts.map((conflict) => ({ id: conflict.code, kind: "conflict" as const, title: "Multiple sources", detail: conflict.message })),
    ],
    narrative: {
      overview: `${trace.reached.assetIds.length} assets and ${trace.reached.conductorIds.length} conductors reached.`,
      statements: trace.sources.length
        ? trace.sources.map((source) => `Reached circuit ${source.circuitId} through breaker pole ${source.breakerPoleId}.`)
        : ["No source breaker is currently known for this selection."],
    },
  };
}

export async function tracePropertyTopology(
  identity: RequestIdentity,
  propertyId: string,
  root: TraceRoot,
) {
  const topology = await loadElectricalTopology(identity, propertyId);
  const trace = traceTopology(topology, [root]);
  return {
    topology,
    trace,
    validation: validateTopology(topology),
    visualModel: topologyVisualModel(topology, trace),
  };
}

export async function assetCircuitLookup(
  identity: RequestIdentity,
  propertyId: string,
  assetId: string,
) {
  const topology = await loadElectricalTopology(identity, propertyId);
  const targetAsset = await getDb().query.assets.findFirst({
    where: and(eq(assets.propertyId, propertyId), eq(assets.id, assetId), ne(assets.lifecycleState, "archived")),
  });
  if (!targetAsset) throw new NotFoundError("Asset not found.");
  const resolution = resolveCircuitMembership(topology, { kind: "asset", id: assetId });
  const circuitIds = resolution.memberships.map((item) => item.circuitId);
  const circuitRows = circuitIds.length
    ? await getDb().select().from(circuits).where(and(eq(circuits.propertyId, propertyId), inArray(circuits.id, circuitIds), ne(circuits.lifecycleState, "archived")))
    : [];
  const directSources = circuitIds.length
    ? await getDb().select().from(circuitSources).where(and(eq(circuitSources.propertyId, propertyId), inArray(circuitSources.circuitId, circuitIds)))
    : [];
  const poleIds = [...new Set([
    ...resolution.memberships.flatMap((item) => item.breakerPoleId ? [item.breakerPoleId] : []),
    ...directSources.map((source) => source.breakerPoleId),
  ])];
  const poleRows = poleIds.length
    ? await getDb().select().from(breakerPoles).where(and(eq(breakerPoles.propertyId, propertyId), inArray(breakerPoles.id, poleIds)))
    : [];
  const breakerIds = [...new Set(poleRows.map((row) => row.breakerId))];
  const breakerRows = breakerIds.length
    ? await getDb().select().from(breakers).where(and(eq(breakers.propertyId, propertyId), inArray(breakers.id, breakerIds), ne(breakers.lifecycleState, "archived")))
    : [];
  return { asset: targetAsset, resolution, circuits: circuitRows, breakerPoles: poleRows, breakers: breakerRows };
}

export async function topologyEntityCircuitLookup(
  identity: RequestIdentity,
  propertyId: string,
  target: { kind: "asset" | "box" | "cable" | "conductor" | "node"; id: string },
) {
  const topology = await loadElectricalTopology(identity, propertyId);
  const trace = traceTopology(topology, [target]);
  const circuitIds = [...new Set(trace.sources.map((source) => source.circuitId))];
  const poleIds = [...new Set(trace.sources.map((source) => source.breakerPoleId))];
  const db = getDb();
  const [circuitRows, poleRows] = await Promise.all([
    circuitIds.length ? db.select().from(circuits).where(and(eq(circuits.propertyId, propertyId), inArray(circuits.id, circuitIds))) : [],
    poleIds.length ? db.select().from(breakerPoles).where(and(eq(breakerPoles.propertyId, propertyId), inArray(breakerPoles.id, poleIds))) : [],
  ]);
  const breakerIds = [...new Set(poleRows.map((row) => row.breakerId))];
  const breakerRows = breakerIds.length ? await db.select().from(breakers).where(and(eq(breakers.propertyId, propertyId), inArray(breakers.id, breakerIds))) : [];
  return {
    target,
    trace,
    circuits: circuitRows,
    breakerPoles: poleRows,
    breakers: breakerRows,
    paths: trace.sources.map((source) => ({ source, path: explainTracePath(trace, source.nodeId) })),
    gaps: trace.gaps,
    conflicts: trace.conflicts,
  };
}

export async function breakerConnectedLookup(
  identity: RequestIdentity,
  propertyId: string,
  breakerId: string,
) {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const breaker = await db.query.breakers.findFirst({
    where: and(eq(breakers.propertyId, propertyId), eq(breakers.id, breakerId), ne(breakers.lifecycleState, "archived")),
  });
  if (!breaker) throw new NotFoundError("Breaker not found.");
  const poles = await db.select().from(breakerPoles).where(and(eq(breakerPoles.propertyId, propertyId), eq(breakerPoles.breakerId, breakerId)));
  const topology = await loadElectricalTopology(identity, propertyId);
  const traces = poles.map((pole) => traceTopology(topology, [{ kind: "breaker-pole", id: pole.id }]));
  const reachedAssetIds = [...new Set(traces.flatMap((trace) => trace.reached.assetIds))];
  const manual = await db.select().from(assetCircuitAssertions).where(and(eq(assetCircuitAssertions.propertyId, propertyId), eq(assetCircuitAssertions.status, "active")));
  const poleIds = poles.map((pole) => pole.id);
  const directSourceRows = poleIds.length
    ? await db.select().from(circuitSources).where(and(eq(circuitSources.propertyId, propertyId), inArray(circuitSources.breakerPoleId, poleIds)))
    : [];
  const candidateCircuitIds = [...new Set(directSourceRows.map((source) => source.circuitId))];
  const activeCircuitRows = candidateCircuitIds.length
    ? await db.select({ id: circuits.id }).from(circuits).where(and(eq(circuits.propertyId, propertyId), inArray(circuits.id, candidateCircuitIds), ne(circuits.lifecycleState, "archived")))
    : [];
  // A manual circuit assertion must remain useful before the source pole has
  // been connected to a conductor-level electrical node.
  const circuitIds = activeCircuitRows.map((row) => row.id);
  const assertedAssetIds = manual.filter((assertion) => circuitIds.includes(assertion.circuitId)).map((assertion) => assertion.assetId);
  const allAssetIds = [...new Set([...reachedAssetIds, ...assertedAssetIds])];
  const memberRows = await db.select().from(controlMembers).where(eq(controlMembers.propertyId, propertyId));
  const functionRows = await db.select().from(assetFunctions).where(eq(assetFunctions.propertyId, propertyId));
  const functionById = new Map(functionRows.map((row) => [row.id, row]));
  const relevantGroupIds = new Set(memberRows.filter((member) => {
    const fn = functionById.get(member.assetFunctionId);
    return Boolean(fn && allAssetIds.includes(fn.assetId));
  }).map((member) => member.controlGroupId));
  const controlAssetIds = [...new Set(memberRows.filter((member) => relevantGroupIds.has(member.controlGroupId)).flatMap((member) => {
    const fn = functionById.get(member.assetFunctionId);
    return fn ? [fn.assetId] : [];
  }))];
  allAssetIds.push(...controlAssetIds.filter((id) => !allAssetIds.includes(id)));
  const connectedAssets = allAssetIds.length
    ? await db.select().from(assets).where(and(eq(assets.propertyId, propertyId), inArray(assets.id, allAssetIds), ne(assets.lifecycleState, "archived")))
    : [];
  const reached = {
    assetIds: reachedAssetIds,
    boxIds: [...new Set(traces.flatMap((trace) => trace.reached.boxIds))],
    cableIds: [...new Set(traces.flatMap((trace) => trace.reached.cableIds))],
    conductorIds: [...new Set(traces.flatMap((trace) => trace.reached.conductorIds))],
    nodeIds: [...new Set(traces.flatMap((trace) => trace.reached.nodeIds))],
  };
  return { breaker, poles, circuitIds, connectedAssets, traces, reached, assertedAssetIds, controlAssetIds };
}
