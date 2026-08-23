import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Conductor,
  ConductorEnd,
  ElectricalNode,
  ElectricalTopology,
  InternalConnection,
} from "../../lib/domain/electrical";
import {
  deriveCircuitMembership,
  explainTracePath,
  generateMultiWayPreset,
  mergeCircuitAssertions,
  traceTopology,
} from "../../lib/topology";
import { validateTopology } from "../../lib/validation";

const propertyId = "property-fictional";
const certainty = "test-verified" as const;

function terminal(
  id: string,
  ownerAssetId: string,
  containingBoxId = `${ownerAssetId}:box`,
): ElectricalNode {
  return {
    id,
    propertyId,
    kind: "terminal",
    ownerAssetId,
    containingAssetId: ownerAssetId,
    containingBoxId,
    certainty,
  };
}

function conductor(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  electricalClass: Conductor["electricalClass"] = "power",
  extra: Partial<Conductor> = {},
): { conductor: Conductor; ends: ConductorEnd[] } {
  return {
    conductor: {
      id,
      propertyId,
      kind: "standalone",
      electricalClass,
      certainty,
      ...extra,
    },
    ends: [
      {
        id: `${id}:a`,
        propertyId,
        conductorId: id,
        designation: "A",
        nodeId: fromNodeId,
        certainty,
      },
      {
        id: `${id}:b`,
        propertyId,
        conductorId: id,
        designation: "B",
        nodeId: toNodeId,
        certainty,
      },
    ],
  };
}

function assembleTopology(
  nodes: ElectricalNode[],
  wires: ReturnType<typeof conductor>[],
  internalConnections: InternalConnection[],
  sourceNodeIds = ["source"],
): ElectricalTopology {
  return {
    propertyId,
    nodes,
    conductors: wires.map((wire) => wire.conductor),
    conductorEnds: wires.flatMap((wire) => wire.ends),
    internalConnections,
    sources: sourceNodeIds.map((nodeId, index) => ({
      id: `source-record-${index}`,
      propertyId,
      circuitId: `circuit-${index + 1}`,
      breakerPoleId: `breaker-${index + 1}`,
      nodeId,
      certainty,
    })),
  };
}

test("traces a simple breaker through a possible switch state to a fixture and explains the path", () => {
  const topology = assembleTopology(
    [
      { id: "source", propertyId, kind: "source", certainty },
      terminal("switch-line", "switch-1"),
      terminal("switch-load", "switch-1"),
      terminal("fixture-line", "fixture-1"),
      terminal("fixture-neutral", "fixture-1"),
    ],
    [
      conductor("line-feed", "source", "switch-line"),
      conductor(
        "switched-leg",
        "switch-load",
        "fixture-line",
        "switched-power",
      ),
    ],
    [
      {
        id: "switch-contact-on",
        propertyId,
        fromNodeId: "switch-line",
        toNodeId: "switch-load",
        kind: "conditional-contact",
        contactStateGroup: "switch-1:state",
        contactState: "on",
        certainty,
      },
      {
        id: "lamp-load",
        propertyId,
        fromNodeId: "fixture-line",
        toNodeId: "fixture-neutral",
        kind: "load-impedance",
        certainty,
      },
    ],
  );

  const trace = traceTopology(topology, [
    { kind: "breaker-pole", id: "breaker-1" },
  ]);
  assert.deepEqual(trace.reached.assetIds, ["fixture-1", "switch-1"]);
  assert.deepEqual(trace.reached.breakerPoleIds, ["breaker-1"]);
  assert.ok(
    trace.traversedEdges.some(
      (edge) =>
        edge.relationshipId === "switch-contact-on" &&
        edge.conditional &&
        edge.contactState === "on",
    ),
  );
  assert.ok(trace.stops.some((stop) => stop.reason === "load"));
  assert.ok(!trace.reached.nodeIds.includes("fixture-neutral"));

  const path = explainTracePath(trace, "fixture-line");
  assert.deepEqual(path?.nodeIds, [
    "source",
    "switch-line",
    "switch-load",
    "fixture-line",
  ]);
  assert.deepEqual(path?.edgeIds, [
    "conductor:line-feed",
    "internal:switch-contact-on",
    "conductor:switched-leg",
  ]);
});

test("does not combine mutually exclusive contacts from one switch state group", () => {
  const topology = assembleTopology(
    [
      { id: "source", propertyId, kind: "source", certainty },
      terminal("traveler-a", "endpoint-switch"),
      terminal("common", "endpoint-switch"),
      terminal("traveler-b", "endpoint-switch"),
      terminal("unrelated-load", "fixture-on-other-traveler"),
    ],
    [
      conductor("feed-traveler-a", "source", "traveler-a"),
      conductor("other-traveler-leg", "traveler-b", "unrelated-load"),
    ],
    [
      {
        id: "endpoint-position-a",
        propertyId,
        fromNodeId: "common",
        toNodeId: "traveler-a",
        kind: "conditional-contact",
        contactStateGroup: "endpoint-switch:position",
        contactState: "a",
        certainty,
      },
      {
        id: "endpoint-position-b",
        propertyId,
        fromNodeId: "common",
        toNodeId: "traveler-b",
        kind: "conditional-contact",
        contactStateGroup: "endpoint-switch:position",
        contactState: "b",
        certainty,
      },
    ],
  );

  const trace = traceTopology(topology, [
    { kind: "breaker-pole", id: "breaker-1" },
  ]);

  assert.ok(trace.reached.nodeIds.includes("common"));
  assert.ok(!trace.reached.nodeIds.includes("traveler-b"));
  assert.ok(!trace.reached.assetIds.includes("fixture-on-other-traveler"));
});

test("supports a source-at-fixture switch loop without inferring function from color", () => {
  const outgoing = conductor(
    "switch-loop-outgoing",
    "fixture-source-splice",
    "switch-line",
    "power",
    {
      observedInsulationColor: "white",
      reidentificationMarking: "black tape",
      observedRole: "line to switch",
    },
  );
  const topology = assembleTopology(
    [
      {
        id: "fixture-source-splice",
        propertyId,
        kind: "source",
        containingBoxId: "fixture-box",
        certainty,
      },
      terminal("switch-line", "switch-loop"),
      terminal("switch-load", "switch-loop"),
      terminal("fixture-line", "fixture-loop-light", "fixture-box"),
      terminal("fixture-neutral", "fixture-loop-light", "fixture-box"),
    ],
    [
      outgoing,
      conductor(
        "switch-loop-return",
        "switch-load",
        "fixture-line",
        "switched-power",
      ),
    ],
    [
      {
        id: "switch-loop-contact",
        propertyId,
        fromNodeId: "switch-line",
        toNodeId: "switch-load",
        kind: "conditional-contact",
        contactState: "on",
        certainty,
      },
      {
        id: "fixture-loop-load",
        propertyId,
        fromNodeId: "fixture-line",
        toNodeId: "fixture-neutral",
        kind: "load-impedance",
        certainty,
      },
    ],
    ["fixture-source-splice"],
  );

  const trace = traceTopology(topology, [{ kind: "circuit", id: "circuit-1" }]);
  assert.deepEqual(trace.reached.assetIds, [
    "fixture-loop-light",
    "switch-loop",
  ]);
  assert.equal(
    topology.conductors.find((item) => item.id === outgoing.conductor.id)
      ?.observedInsulationColor,
    "white",
  );
  assert.equal(
    topology.conductors.find((item) => item.id === outgoing.conductor.id)
      ?.electricalClass,
    "power",
  );
});

test("stops supply traversal at loads, isolation, signal, and grounding paths", () => {
  const topology = assembleTopology(
    [
      { id: "source", propertyId, kind: "source", certainty },
      terminal("load-destination", "load-asset"),
      terminal("isolation-destination", "isolated-asset"),
      terminal("signal-destination", "signal-asset"),
      {
        id: "bond-destination",
        propertyId,
        kind: "bond",
        containingBoxId: "source-box",
        certainty,
      },
    ],
    [
      conductor(
        "equipment-ground",
        "source",
        "bond-destination",
        "equipment-ground",
        { kind: "equipment-ground" },
      ),
    ],
    [
      {
        id: "load-boundary",
        propertyId,
        fromNodeId: "source",
        toNodeId: "load-destination",
        kind: "load-impedance",
        certainty,
      },
      {
        id: "isolation-boundary",
        propertyId,
        fromNodeId: "source",
        toNodeId: "isolation-destination",
        kind: "isolation-boundary",
        certainty,
      },
      {
        id: "signal-boundary",
        propertyId,
        fromNodeId: "source",
        toNodeId: "signal-destination",
        kind: "signal-only",
        certainty,
      },
    ],
  );

  const trace = traceTopology(topology, [{ kind: "node", id: "source" }]);
  assert.deepEqual(
    new Set(trace.stops.map((stop) => stop.reason)),
    new Set(["load", "isolation", "signal", "ground"]),
  );
  assert.deepEqual(trace.reached.nodeIds, ["source"]);
  assert.equal(trace.boundaryEdges.length, 4);
  assert.equal(trace.traversedEdges.length, 0);
});

for (const controllerCount of [2, 3, 4, 6, 11, 24]) {
  test(`uses one generic contact graph for ${controllerCount} controllers`, () => {
    const preset = generateMultiWayPreset({
      propertyId,
      controllerCount,
      idPrefix: `arrangement-${controllerCount}`,
      certainty,
    });
    const validation = validateTopology(preset.topology);
    assert.equal(validation.valid, true);
    assert.ok(
      !validation.warnings.some(
        (warning) => warning.code === "INCOMPLETE_CONTACT_STATE_GROUP",
      ),
    );
    assert.equal(preset.controllers.length, controllerCount);
    assert.equal(
      preset.controllers.filter((controller) => controller.role === "endpoint")
        .length,
      2,
    );
    assert.equal(
      preset.controllers.filter(
        (controller) => controller.role === "intermediate",
      ).length,
      controllerCount - 2,
    );
    assert.equal(preset.travelerConductorIds.length, (controllerCount - 1) * 2);

    const trace = traceTopology(preset.topology, [
      { kind: "breaker-pole", id: `arrangement-${controllerCount}:breaker-pole` },
    ]);
    assert.ok(trace.reached.assetIds.includes(preset.loadAssetId));
    for (const controller of preset.controllers) {
      assert.ok(
        trace.reached.assetIds.includes(controller.assetId),
        `controller ${controller.index} should be reachable`,
      );
    }
    assert.ok(trace.stops.some((stop) => stop.reason === "load"));

    const reverse = deriveCircuitMembership(preset.topology, {
      kind: "asset",
      id: preset.loadAssetId,
    });
    assert.deepEqual(
      reverse.derived.map((membership) => membership.breakerPoleId),
      [`arrangement-${controllerCount}:breaker-pole`],
    );
  });
}

test("reports multiple unrelated reachable sources without collapsing them", () => {
  const topology = assembleTopology(
    [
      { id: "source-a", propertyId, kind: "source", certainty },
      { id: "source-b", propertyId, kind: "source", certainty },
      {
        id: "shared-splice",
        propertyId,
        kind: "splice",
        containingBoxId: "shared-box",
        certainty,
      },
    ],
    [
      conductor("feed-a", "source-a", "shared-splice"),
      conductor("feed-b", "source-b", "shared-splice"),
    ],
    [],
    ["source-a", "source-b"],
  );

  const trace = traceTopology(topology, [
    { kind: "node", id: "shared-splice" },
  ]);
  assert.deepEqual(trace.reached.circuitIds, ["circuit-1", "circuit-2"]);
  assert.deepEqual(trace.reached.breakerPoleIds, ["breaker-1", "breaker-2"]);
  assert.equal(trace.conflicts[0]?.code, "MULTIPLE_SOURCE_GROUPS");
  assert.equal(trace.sources.length, 2);
});

test("surfaces an unknown gap as a boundary without inventing connectivity", () => {
  const topology: ElectricalTopology = {
    ...assembleTopology(
      [
        { id: "source", propertyId, kind: "source", certainty },
        {
          id: "known-node",
          propertyId,
          kind: "junction",
          containingBoxId: "known-box",
          certainty,
        },
        {
          id: "unknown-island",
          propertyId,
          kind: "junction",
          containingBoxId: "other-box",
          certainty: "unknown",
        },
      ],
      [conductor("known-run", "source", "known-node")],
      [],
    ),
    traceGaps: [
      {
        id: "gap-1",
        propertyId,
        fromNodeId: "known-node",
        toNodeId: "unknown-island",
        status: "unresolved",
        certainty: "unknown",
      },
    ],
  };

  const trace = traceTopology(topology, [{ kind: "node", id: "source" }]);
  assert.equal(trace.gaps[0]?.id, "gap-1");
  assert.equal(trace.gaps[0]?.reachedFromNodeId, "known-node");
  assert.ok(trace.stops.some((stop) => stop.reason === "unknown-gap"));
  assert.ok(!trace.reached.nodeIds.includes("unknown-island"));
});

test("merges manual assertions with derivation while preserving conflicts", () => {
  const preset = generateMultiWayPreset({
    propertyId,
    controllerCount: 4,
    idPrefix: "assertion-case",
    certainty,
  });
  const target = { kind: "asset", id: preset.loadAssetId } as const;
  const derivation = deriveCircuitMembership(preset.topology, target);
  const assertion = {
    id: "manual-assertion",
    propertyId,
    target,
    circuitId: "different-circuit",
    breakerPoleId: "different-breaker",
    certainty: "visually-observed",
  } as const;
  const resolution = mergeCircuitAssertions(
    derivation.derived,
    [assertion],
    target,
  );

  assert.equal(resolution.conflicts.length, 1);
  assert.equal(resolution.memberships.length, 2);
  assert.ok(
    resolution.memberships.some(
      (membership) =>
        membership.provenance === "graph" &&
        membership.circuitId === "assertion-case:circuit",
    ),
  );
  assert.ok(
    resolution.memberships.some(
      (membership) =>
        membership.provenance === "assertion" &&
        membership.status === "conflicting" &&
        membership.circuitId === "different-circuit",
    ),
  );
});
