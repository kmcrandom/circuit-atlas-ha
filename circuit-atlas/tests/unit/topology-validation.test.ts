import assert from "node:assert/strict";
import { test } from "vitest";

import type { ElectricalTopology } from "../../lib/domain/electrical";
import {
  hasBlockingTopologyErrors,
  validateTopology,
} from "../../lib/validation";

const propertyId = "property-validation";

function incompleteTopology(): ElectricalTopology {
  return {
    propertyId,
    nodes: [
      { id: "source", propertyId, kind: "source" },
      {
        id: "unknown-end",
        propertyId,
        kind: "unknown-end",
        containingBoxId: "box-1",
      },
    ],
    conductors: [
      {
        id: "wire-1",
        propertyId,
        cableId: "cable-1",
        kind: "cable-core",
        electricalClass: "unknown",
      },
    ],
    conductorEnds: [
      {
        id: "wire-1:a",
        propertyId,
        conductorId: "wire-1",
        designation: "A",
        nodeId: "source",
      },
      {
        id: "wire-1:b",
        propertyId,
        conductorId: "wire-1",
        designation: "B",
        nodeId: "unknown-end",
      },
    ],
    cables: [
      {
        id: "cable-1",
        propertyId,
        insulatedConductorCount: 2,
        equipmentGroundCount: 1,
        gauge: null,
      },
    ],
    cableEnds: [
      {
        id: "cable-1:a",
        propertyId,
        cableId: "cable-1",
        designation: "A",
        endpointAssetId: "panel-1",
      },
      {
        id: "cable-1:b",
        propertyId,
        cableId: "cable-1",
        designation: "B",
      },
    ],
    internalConnections: [],
    sources: [
      {
        id: "source-record",
        propertyId,
        circuitId: "circuit-1",
        breakerPoleId: "breaker-1",
        nodeId: "source",
      },
    ],
  };
}

test("keeps incomplete observed knowledge saveable and emits specific warnings", () => {
  const result = validateTopology(incompleteTopology());
  assert.equal(result.valid, true);
  assert.equal(result.canSave, true);
  assert.equal(hasBlockingTopologyErrors(incompleteTopology()), false);
  assert.deepEqual(
    new Set(result.warnings.map((warning) => warning.code)),
    new Set([
      "MISSING_CABLE_GAUGE",
      "UNKNOWN_CABLE_ENDPOINT",
      "UNKNOWN_CONDUCTOR_FUNCTION",
      "CABLE_CONDUCTOR_COUNT_MISMATCH",
      "CABLE_GROUND_COUNT_MISMATCH",
      "UNRESOLVED_CONDUCTOR",
    ]),
  );
});

test("blocks impossible conductor cardinality and cross-property records", () => {
  const topology = incompleteTopology();
  const malformed: ElectricalTopology = {
    ...topology,
    conductorEnds: topology.conductorEnds.slice(0, 1),
    nodes: [
      ...topology.nodes,
      {
        id: "foreign-node",
        propertyId: "a-different-property",
        kind: "source",
      },
    ],
  };
  const result = validateTopology(malformed);
  assert.equal(result.valid, false);
  assert.equal(result.canSave, false);
  assert.equal(hasBlockingTopologyErrors(malformed), true);
  assert.ok(
    result.errors.some(
      (error) => error.code === "CONDUCTOR_END_CARDINALITY",
    ),
  );
  assert.ok(
    result.errors.some((error) => error.code === "CONDUCTOR_END_DESIGNATION"),
  );
  assert.ok(
    result.errors.some((error) => error.code === "CROSS_PROPERTY_RECORD"),
  );
});

test("detects an incomplete intermediate contact state without blocking save", () => {
  const topology: ElectricalTopology = {
    propertyId,
    nodes: ["left-a", "left-b", "right-a", "right-b"].map((id) => ({
      id,
      propertyId,
      kind: "terminal" as const,
      ownerAssetId: "switch-intermediate",
    })),
    conductors: [],
    conductorEnds: [],
    sources: [],
    internalConnections: [
      {
        id: "straight-a",
        propertyId,
        fromNodeId: "left-a",
        toNodeId: "right-a",
        kind: "conditional-contact",
        contactStateGroup: "switch-state",
        contactState: "straight",
      },
      {
        id: "cross-a",
        propertyId,
        fromNodeId: "left-a",
        toNodeId: "right-b",
        kind: "conditional-contact",
        contactStateGroup: "switch-state",
        contactState: "cross",
      },
    ],
    contactStateGroups: [
      {
        id: "switch-state",
        propertyId,
        ownerAssetId: "switch-intermediate",
        role: "intermediate",
        expectedStateCount: 2,
        terminalNodeIds: ["left-a", "left-b", "right-a", "right-b"],
      },
    ],
  };
  const result = validateTopology(topology);
  assert.equal(result.valid, true);
  assert.ok(
    result.warnings.some(
      (warning) => warning.code === "INCOMPLETE_CONTACT_STATE_GROUP",
    ),
  );
});

test("reports a conductor/cable endpoint box contradiction as structural", () => {
  const topology = incompleteTopology();
  const contradictory: ElectricalTopology = {
    ...topology,
    nodes: topology.nodes.map((node) =>
      node.id === "unknown-end"
        ? { ...node, containingBoxId: "different-box" }
        : node,
    ),
    cableEnds: topology.cableEnds?.map((end) =>
      end.designation === "B" ? { ...end, containingBoxId: "cable-box" } : end,
    ),
  };
  const result = validateTopology(contradictory);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (error) => error.code === "CABLE_ENDPOINT_BOX_MISMATCH",
    ),
  );
});
