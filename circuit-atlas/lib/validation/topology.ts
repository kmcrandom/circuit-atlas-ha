import type {
  AssetCircuitAssertion,
  Cable,
  Certainty,
  ElectricalTopology,
} from "../domain/electrical";
import { deriveCircuitMembership, mergeCircuitAssertions } from "../topology/assertions";
import { traceTopology } from "../topology/trace";

export type ValidationSeverity = "error" | "warning";

export type TopologyValidationCode =
  | "CROSS_PROPERTY_RECORD"
  | "DUPLICATE_ID"
  | "CONDUCTOR_END_CARDINALITY"
  | "CONDUCTOR_END_DESIGNATION"
  | "CABLE_END_CARDINALITY"
  | "CABLE_END_DESIGNATION"
  | "MISSING_CONDUCTOR"
  | "MISSING_CABLE"
  | "MISSING_NODE"
  | "MISSING_NODE_CONTAINER"
  | "CABLE_ENDPOINT_BOX_MISMATCH"
  | "INVALID_INTERNAL_CONNECTION"
  | "INVALID_SOURCE"
  | "INVALID_TRACE_GAP"
  | "INVALID_ASSERTION_TARGET"
  | "MISSING_CABLE_GAUGE"
  | "UNKNOWN_CABLE_ENDPOINT"
  | "UNKNOWN_CONDUCTOR_FUNCTION"
  | "CABLE_CONDUCTOR_COUNT_MISMATCH"
  | "CABLE_GROUND_COUNT_MISMATCH"
  | "GAUGE_MISMATCH"
  | "UNRESOLVED_CONDUCTOR"
  | "SELF_CONNECTION"
  | "MULTIPLE_SOURCE_GROUPS"
  | "INCOMPLETE_CONTACT_STATE_GROUP"
  | "ASSERTION_CONFLICT";

export interface TopologyValidationIssue {
  id: string;
  severity: ValidationSeverity;
  code: TopologyValidationCode;
  message: string;
  entityIds: readonly string[];
}

export interface TopologyValidationResult {
  valid: boolean;
  canSave: boolean;
  errors: readonly TopologyValidationIssue[];
  warnings: readonly TopologyValidationIssue[];
  issues: readonly TopologyValidationIssue[];
}

function makeIssue(
  severity: ValidationSeverity,
  code: TopologyValidationCode,
  key: string,
  message: string,
  entityIds: readonly string[],
): TopologyValidationIssue {
  return {
    id: `${severity}:${code}:${key}`,
    severity,
    code,
    message,
    entityIds,
  };
}

function collectDuplicateIdIssues(
  collectionName: string,
  records: readonly { id: string }[],
): TopologyValidationIssue[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([id]) =>
      makeIssue(
        "error",
        "DUPLICATE_ID",
        `${collectionName}:${id}`,
        `${collectionName} contains duplicate ID ${id}.`,
        [id],
      ),
    );
}

function propertyIssues(topology: ElectricalTopology): TopologyValidationIssue[] {
  const collections: readonly [string, readonly { id: string; propertyId: string }[]][] = [
    ["nodes", topology.nodes],
    ["conductors", topology.conductors],
    ["conductorEnds", topology.conductorEnds],
    ["internalConnections", topology.internalConnections],
    ["sources", topology.sources],
    ["cables", topology.cables ?? []],
    ["cableEnds", topology.cableEnds ?? []],
    ["traceGaps", topology.traceGaps ?? []],
    ["assertions", topology.assertions ?? []],
    ["contactStateGroups", topology.contactStateGroups ?? []],
  ];

  return collections.flatMap(([name, records]) =>
    records.flatMap((record) =>
      record.propertyId === topology.propertyId
        ? []
        : [
            makeIssue(
              "error",
              "CROSS_PROPERTY_RECORD",
              `${name}:${record.id}`,
              `${name} record ${record.id} belongs to another property.`,
              [record.id, record.propertyId, topology.propertyId],
            ),
          ],
    ),
  );
}

function endpointCardinalityIssues(
  topology: ElectricalTopology,
): TopologyValidationIssue[] {
  const issues: TopologyValidationIssue[] = [];
  const endsByConductor = new Map<string, typeof topology.conductorEnds[number][]>();
  for (const end of topology.conductorEnds) {
    const ends = endsByConductor.get(end.conductorId) ?? [];
    ends.push(end);
    endsByConductor.set(end.conductorId, ends);
  }
  for (const conductor of topology.conductors) {
    const ends = endsByConductor.get(conductor.id) ?? [];
    if (ends.length !== 2) {
      issues.push(
        makeIssue(
          "error",
          "CONDUCTOR_END_CARDINALITY",
          conductor.id,
          `Conductor ${conductor.id} must have exactly two explicit ends; found ${ends.length}.`,
          [conductor.id, ...ends.map((end) => end.id)],
        ),
      );
    }
    const designationCounts = new Map(
      (["A", "B"] as const).map((designation) => [
        designation,
        ends.filter((end) => end.designation === designation).length,
      ]),
    );
    if (
      designationCounts.get("A") !== 1 ||
      designationCounts.get("B") !== 1
    ) {
      issues.push(
        makeIssue(
          "error",
          "CONDUCTOR_END_DESIGNATION",
          conductor.id,
          `Conductor ${conductor.id} must have one A end and one B end.`,
          [conductor.id, ...ends.map((end) => end.id)],
        ),
      );
    }
  }

  const endsByCable = new Map<string, NonNullable<ElectricalTopology["cableEnds"]>[number][]>();
  for (const end of topology.cableEnds ?? []) {
    const ends = endsByCable.get(end.cableId) ?? [];
    ends.push(end);
    endsByCable.set(end.cableId, ends);
  }
  for (const cable of topology.cables ?? []) {
    const ends = endsByCable.get(cable.id) ?? [];
    if (ends.length !== 2) {
      issues.push(
        makeIssue(
          "error",
          "CABLE_END_CARDINALITY",
          cable.id,
          `Cable ${cable.id} must have exactly two explicit ends; found ${ends.length}.`,
          [cable.id, ...ends.map((end) => end.id)],
        ),
      );
    }
    if (
      ends.filter((end) => end.designation === "A").length !== 1 ||
      ends.filter((end) => end.designation === "B").length !== 1
    ) {
      issues.push(
        makeIssue(
          "error",
          "CABLE_END_DESIGNATION",
          cable.id,
          `Cable ${cable.id} must have one A end and one B end.`,
          [cable.id, ...ends.map((end) => end.id)],
        ),
      );
    }
  }
  return issues;
}

function referenceIssues(topology: ElectricalTopology): TopologyValidationIssue[] {
  const issues: TopologyValidationIssue[] = [];
  const nodeIds = new Set(topology.nodes.map((node) => node.id));
  const conductorIds = new Set(topology.conductors.map((conductor) => conductor.id));
  const cableIds = new Set((topology.cables ?? []).map((cable) => cable.id));

  for (const end of topology.conductorEnds) {
    if (!conductorIds.has(end.conductorId)) {
      issues.push(
        makeIssue(
          "error",
          "MISSING_CONDUCTOR",
          end.id,
          `Conductor end ${end.id} references missing conductor ${end.conductorId}.`,
          [end.id, end.conductorId],
        ),
      );
    }
    if (!nodeIds.has(end.nodeId)) {
      issues.push(
        makeIssue(
          "error",
          "MISSING_NODE",
          end.id,
          `Conductor end ${end.id} references missing node ${end.nodeId}.`,
          [end.id, end.nodeId],
        ),
      );
    }
  }

  for (const conductor of topology.conductors) {
    if (conductor.cableId && !cableIds.has(conductor.cableId)) {
      issues.push(
        makeIssue(
          "error",
          "MISSING_CABLE",
          conductor.id,
          `Conductor ${conductor.id} references missing cable ${conductor.cableId}.`,
          [conductor.id, conductor.cableId],
        ),
      );
    }
  }
  for (const end of topology.cableEnds ?? []) {
    if (!cableIds.has(end.cableId)) {
      issues.push(
        makeIssue(
          "error",
          "MISSING_CABLE",
          end.id,
          `Cable end ${end.id} references missing cable ${end.cableId}.`,
          [end.id, end.cableId],
        ),
      );
    }
  }

  for (const connection of topology.internalConnections) {
    const missing = [connection.fromNodeId, connection.toNodeId].filter(
      (id) => !nodeIds.has(id),
    );
    if (missing.length > 0) {
      issues.push(
        makeIssue(
          "error",
          "INVALID_INTERNAL_CONNECTION",
          connection.id,
          `Internal connection ${connection.id} references missing graph nodes.`,
          [connection.id, ...missing],
        ),
      );
    }
    if (connection.fromNodeId === connection.toNodeId) {
      issues.push(
        makeIssue(
          "warning",
          "SELF_CONNECTION",
          connection.id,
          `Internal connection ${connection.id} connects a node to itself.`,
          [connection.id, connection.fromNodeId],
        ),
      );
    }
  }

  for (const source of topology.sources) {
    if (!nodeIds.has(source.nodeId)) {
      issues.push(
        makeIssue(
          "error",
          "INVALID_SOURCE",
          source.id,
          `Circuit source ${source.id} references missing node ${source.nodeId}.`,
          [source.id, source.nodeId],
        ),
      );
    }
  }
  for (const gap of topology.traceGaps ?? []) {
    const missing = [gap.fromNodeId, gap.toNodeId].filter(
      (id): id is string => Boolean(id) && !nodeIds.has(id as string),
    );
    const hasEndpoint = Boolean(
      gap.fromNodeId || gap.toNodeId || gap.fromAssetId || gap.toAssetId,
    );
    if (!hasEndpoint || missing.length > 0) {
      issues.push(
        makeIssue(
          "error",
          "INVALID_TRACE_GAP",
          gap.id,
          `Trace gap ${gap.id} must reference at least one existing endpoint.`,
          [gap.id, ...missing],
        ),
      );
    }
  }

  for (const assertion of topology.assertions ?? []) {
    const targetExists =
      assertion.target.kind === "node"
        ? nodeIds.has(assertion.target.id)
        : assertion.target.kind === "conductor"
          ? conductorIds.has(assertion.target.id)
          : assertion.target.kind === "cable"
            ? cableIds.has(assertion.target.id)
            : true;
    if (!targetExists) {
      issues.push(
        makeIssue(
          "error",
          "INVALID_ASSERTION_TARGET",
          assertion.id,
          `Circuit assertion ${assertion.id} references a missing target.`,
          [assertion.id, assertion.target.id],
        ),
      );
    }
  }
  return issues;
}

function containmentIssues(topology: ElectricalTopology): TopologyValidationIssue[] {
  return topology.nodes.flatMap((node) => {
    if (node.kind === "source") return [];
    const hasContainer = Boolean(
      node.containingBoxId || node.containingAssetId || node.ownerAssetId,
    );
    return hasContainer
      ? []
      : [
          makeIssue(
            "error",
            "MISSING_NODE_CONTAINER",
            node.id,
            `Electrical node ${node.id} must be contained by a box or endpoint asset.`,
            [node.id],
          ),
        ];
  });
}

function cableBoxConsistencyIssues(
  topology: ElectricalTopology,
): TopologyValidationIssue[] {
  const issues: TopologyValidationIssue[] = [];
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const cableEndByKey = new Map(
    (topology.cableEnds ?? []).map((end) => [
      `${end.cableId}:${end.designation}`,
      end,
    ]),
  );
  const conductorById = new Map(
    topology.conductors.map((conductor) => [conductor.id, conductor]),
  );

  for (const end of topology.conductorEnds) {
    const conductor = conductorById.get(end.conductorId);
    if (!conductor?.cableId) continue;
    const cableEnd = cableEndByKey.get(
      `${conductor.cableId}:${end.designation}`,
    );
    const node = nodeById.get(end.nodeId);
    if (
      cableEnd?.containingBoxId &&
      node?.containingBoxId &&
      cableEnd.containingBoxId !== node.containingBoxId
    ) {
      issues.push(
        makeIssue(
          "error",
          "CABLE_ENDPOINT_BOX_MISMATCH",
          end.id,
          `Conductor end ${end.id} is in a different box than its parent cable end.`,
          [
            end.id,
            conductor.id,
            cableEnd.id,
            node.containingBoxId,
            cableEnd.containingBoxId,
          ],
        ),
      );
    }
  }
  return issues;
}

function cableWarningIssues(topology: ElectricalTopology): TopologyValidationIssue[] {
  const issues: TopologyValidationIssue[] = [];
  const conductorsByCable = new Map<string, typeof topology.conductors[number][]>();
  for (const conductor of topology.conductors) {
    if (!conductor.cableId) continue;
    const conductors = conductorsByCable.get(conductor.cableId) ?? [];
    conductors.push(conductor);
    conductorsByCable.set(conductor.cableId, conductors);
  }

  for (const cable of topology.cables ?? []) {
    if (!cable.gauge?.trim()) {
      issues.push(
        makeIssue(
          "warning",
          "MISSING_CABLE_GAUGE",
          cable.id,
          `Cable ${cable.id} has no recorded gauge.`,
          [cable.id],
        ),
      );
    }
    const cableEnds = (topology.cableEnds ?? []).filter(
      (end) => end.cableId === cable.id,
    );
    for (const end of cableEnds) {
      if (!end.containingBoxId && !end.endpointAssetId) {
        issues.push(
          makeIssue(
            "warning",
            "UNKNOWN_CABLE_ENDPOINT",
            end.id,
            `Cable end ${end.id} has an unknown location.`,
            [cable.id, end.id],
          ),
        );
      }
    }

    const modeled = conductorsByCable.get(cable.id) ?? [];
    const modeledCores = modeled.filter(
      (conductor) => conductor.kind === "cable-core",
    ).length;
    const modeledGrounds = modeled.filter(
      (conductor) => conductor.kind === "equipment-ground",
    ).length;
    if (
      cable.insulatedConductorCount != null &&
      cable.insulatedConductorCount !== modeledCores
    ) {
      issues.push(
        makeIssue(
          "warning",
          "CABLE_CONDUCTOR_COUNT_MISMATCH",
          cable.id,
          `Cable ${cable.id} records ${cable.insulatedConductorCount} insulated conductors but models ${modeledCores}.`,
          [cable.id, ...modeled.map((conductor) => conductor.id)],
        ),
      );
    }
    if (
      cable.equipmentGroundCount != null &&
      cable.equipmentGroundCount !== modeledGrounds
    ) {
      issues.push(
        makeIssue(
          "warning",
          "CABLE_GROUND_COUNT_MISMATCH",
          cable.id,
          `Cable ${cable.id} records ${cable.equipmentGroundCount} equipment grounds but models ${modeledGrounds}.`,
          [cable.id, ...modeled.map((conductor) => conductor.id)],
        ),
      );
    }
    if (cable.gauge) {
      for (const conductor of modeled) {
        if (conductor.gauge && conductor.gauge !== cable.gauge) {
          issues.push(
            makeIssue(
              "warning",
              "GAUGE_MISMATCH",
              conductor.id,
              `Conductor ${conductor.id} gauge differs from parent cable ${cable.id}.`,
              [cable.id, conductor.id],
            ),
          );
        }
      }
    }
  }
  return issues;
}

function conductorWarningIssues(
  topology: ElectricalTopology,
): TopologyValidationIssue[] {
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const endsByConductor = new Map<string, typeof topology.conductorEnds[number][]>();
  for (const end of topology.conductorEnds) {
    const ends = endsByConductor.get(end.conductorId) ?? [];
    ends.push(end);
    endsByConductor.set(end.conductorId, ends);
  }
  return topology.conductors.flatMap((conductor) => {
    const issues: TopologyValidationIssue[] = [];
    if (
      !conductor.electricalClass ||
      conductor.electricalClass === "unknown"
    ) {
      issues.push(
        makeIssue(
          "warning",
          "UNKNOWN_CONDUCTOR_FUNCTION",
          conductor.id,
          `Conductor ${conductor.id} has no known electrical function.`,
          [conductor.id],
        ),
      );
    }
    const unresolvedEnds = (endsByConductor.get(conductor.id) ?? []).filter(
      (end) => {
        const node = nodeById.get(end.nodeId);
        return node?.kind === "open-end" || node?.kind === "unknown-end";
      },
    );
    if (unresolvedEnds.length > 0) {
      issues.push(
        makeIssue(
          "warning",
          "UNRESOLVED_CONDUCTOR",
          conductor.id,
          `Conductor ${conductor.id} has an open or unknown endpoint.`,
          [conductor.id, ...unresolvedEnds.map((end) => end.id)],
        ),
      );
    }
    return issues;
  });
}

function contactGroupWarningIssues(
  topology: ElectricalTopology,
): TopologyValidationIssue[] {
  const declaredGroups = new Map(
    (topology.contactStateGroups ?? []).map((group) => [group.id, group]),
  );
  const connectionsByGroup = new Map<string, typeof topology.internalConnections[number][]>();
  for (const connection of topology.internalConnections) {
    if (!connection.contactStateGroup) continue;
    const connections = connectionsByGroup.get(connection.contactStateGroup) ?? [];
    connections.push(connection);
    connectionsByGroup.set(connection.contactStateGroup, connections);
  }
  const groupIds = new Set([
    ...declaredGroups.keys(),
    ...connectionsByGroup.keys(),
  ]);
  const issues: TopologyValidationIssue[] = [];

  for (const groupId of groupIds) {
    const declaration = declaredGroups.get(groupId);
    const connections = connectionsByGroup.get(groupId) ?? [];
    const stateNames = new Set(
      connections.flatMap((connection) =>
        connection.contactState ? [connection.contactState] : [],
      ),
    );
    let incomplete = connections.some(
      (connection) =>
        connection.kind !== "conditional-contact" || !connection.contactState,
    );
    if (
      declaration?.expectedStateCount !== undefined &&
      stateNames.size !== declaration.expectedStateCount
    ) {
      incomplete = true;
    }

    const stateEdges = new Map<string, typeof connections>();
    for (const connection of connections) {
      if (!connection.contactState) continue;
      const edges = stateEdges.get(connection.contactState) ?? [];
      edges.push(connection);
      stateEdges.set(connection.contactState, edges);
    }
    if (declaration?.role === "endpoint") {
      incomplete ||=
        stateEdges.size !== 2 ||
        [...stateEdges.values()].some((edges) => edges.length !== 1) ||
        new Set(
          connections.flatMap((connection) => [
            connection.fromNodeId,
            connection.toNodeId,
          ]),
        ).size !== 3;
    }
    if (declaration?.role === "intermediate") {
      incomplete ||=
        stateEdges.size !== 2 ||
        [...stateEdges.values()].some(
          (edges) =>
            edges.length !== 2 ||
            new Set(
              edges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]),
            ).size !== 4,
        ) ||
        new Set(
          connections.flatMap((connection) => [
            connection.fromNodeId,
            connection.toNodeId,
          ]),
        ).size !== 4;
    }
    if (declaration?.terminalNodeIds) {
      const participatingNodes = new Set(
        connections.flatMap((connection) => [
          connection.fromNodeId,
          connection.toNodeId,
        ]),
      );
      incomplete ||= declaration.terminalNodeIds.some(
        (nodeId) => !participatingNodes.has(nodeId),
      );
    }

    if (incomplete || connections.length === 0) {
      issues.push(
        makeIssue(
          "warning",
          "INCOMPLETE_CONTACT_STATE_GROUP",
          groupId,
          `Contact state group ${groupId} is incomplete or discontinuous.`,
          [groupId, ...connections.map((connection) => connection.id)],
        ),
      );
    }
  }
  return issues;
}

function sourceWarningIssues(topology: ElectricalTopology): TopologyValidationIssue[] {
  const sourceGroupsByNode = new Map<string, Map<string, Set<string>>>();
  for (const source of topology.sources) {
    const trace = traceTopology(topology, [{ kind: "node", id: source.nodeId }]);
    const groupKey = source.sourceGroupId ?? source.circuitId;
    for (const nodeId of trace.reached.nodeIds) {
      const groups = sourceGroupsByNode.get(nodeId) ?? new Map<string, Set<string>>();
      const sourceIds = groups.get(groupKey) ?? new Set<string>();
      sourceIds.add(source.id);
      groups.set(groupKey, sourceIds);
      sourceGroupsByNode.set(nodeId, groups);
    }
  }

  return [...sourceGroupsByNode]
    .filter(([, groups]) => groups.size > 1)
    .map(([nodeId, groups]) => {
      const sourceIds = [...groups.values()].flatMap((ids) => [...ids]);
      return makeIssue(
        "warning",
        "MULTIPLE_SOURCE_GROUPS",
        nodeId,
        `Node ${nodeId} is reachable from unrelated source groups.`,
        [nodeId, ...sourceIds],
      );
    });
}

function assertionWarningIssues(
  topology: ElectricalTopology,
): TopologyValidationIssue[] {
  const activeAssertions = (topology.assertions ?? []).filter(
    (assertion) => assertion.status !== "retracted",
  );
  const assertionsByTarget = new Map<string, AssetCircuitAssertion[]>();
  for (const assertion of activeAssertions) {
    const key = `${assertion.target.kind}:${assertion.target.id}`;
    const assertions = assertionsByTarget.get(key) ?? [];
    assertions.push(assertion);
    assertionsByTarget.set(key, assertions);
  }

  return [...assertionsByTarget.values()].flatMap((assertions) => {
    const target = assertions[0].target;
    const derivation = deriveCircuitMembership(topology, target);
    const resolution = mergeCircuitAssertions(
      derivation.derived,
      assertions,
      target,
    );
    return resolution.conflicts.map((conflict) =>
      makeIssue(
        "warning",
        "ASSERTION_CONFLICT",
        conflict.id,
        conflict.message,
        [...conflict.assertionIds, ...conflict.sourceIds],
      ),
    );
  });
}

function duplicateIssues(topology: ElectricalTopology): TopologyValidationIssue[] {
  return [
    ["nodes", topology.nodes],
    ["conductors", topology.conductors],
    ["conductorEnds", topology.conductorEnds],
    ["internalConnections", topology.internalConnections],
    ["sources", topology.sources],
    ["cables", topology.cables ?? []],
    ["cableEnds", topology.cableEnds ?? []],
    ["traceGaps", topology.traceGaps ?? []],
    ["assertions", topology.assertions ?? []],
    ["contactStateGroups", topology.contactStateGroups ?? []],
  ].flatMap(([name, records]) =>
    collectDuplicateIdIssues(
      name as string,
      records as readonly { id: string }[],
    ),
  );
}

export function validateTopologyStructure(
  topology: ElectricalTopology,
): readonly TopologyValidationIssue[] {
  return [
    ...propertyIssues(topology),
    ...duplicateIssues(topology),
    ...endpointCardinalityIssues(topology),
    ...referenceIssues(topology).filter((issue) => issue.severity === "error"),
    ...containmentIssues(topology),
    ...cableBoxConsistencyIssues(topology),
  ];
}

export function validateTopology(
  topology: ElectricalTopology,
): TopologyValidationResult {
  const structuralErrors = validateTopologyStructure(topology);
  const warnings = [
    ...referenceIssues(topology).filter((issue) => issue.severity === "warning"),
    ...cableWarningIssues(topology),
    ...conductorWarningIssues(topology),
    ...contactGroupWarningIssues(topology),
    ...sourceWarningIssues(topology),
    ...assertionWarningIssues(topology),
  ];
  const issues = [...structuralErrors, ...warnings];
  return {
    valid: structuralErrors.length === 0,
    canSave: structuralErrors.length === 0,
    errors: structuralErrors,
    warnings,
    issues,
  };
}

/** Convenience helper for forms that only need the save-blocking decision. */
export function hasBlockingTopologyErrors(topology: ElectricalTopology): boolean {
  return validateTopologyStructure(topology).length > 0;
}

/** Stable helper for adapters that normalize optional gauges. */
export function gaugesMatch(
  cable: Pick<Cable, "gauge">,
  conductor: { gauge?: string | null },
): boolean {
  return !cable.gauge || !conductor.gauge || cable.gauge === conductor.gauge;
}

/** Exposed so callers can render evidence status without conflating warnings. */
export function certaintyIsConflict(certainty: Certainty | undefined): boolean {
  return certainty === "conflicting";
}
