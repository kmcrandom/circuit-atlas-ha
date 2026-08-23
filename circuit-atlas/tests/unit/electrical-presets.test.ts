import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type {
  CircuitSource,
  ElectricalNode,
  ElectricalTopology,
} from "../../lib/domain";
import {
  BUILT_IN_ELECTRICAL_PRESETS,
  buildTopologyGraph,
  createConductorConnection,
  createManyToManyControlPreset,
  createMultiLampFixturePreset,
  createPanelFeederPreset,
  createSharedNeutralPreset,
  expandElectricalPreset,
  generateMultiWayPreset,
  getBuiltInElectricalPreset,
  mergeElectricalTopologies,
  traceTopology,
} from "../../lib/topology";
import { validateTopology } from "../../lib/validation";

const propertyId = "property-preset-acceptance";
const certainty = "test-verified" as const;

function fragment(
  partial: Partial<Omit<ElectricalTopology, "propertyId">> = {},
): ElectricalTopology {
  return {
    propertyId,
    nodes: partial.nodes ?? [],
    conductors: partial.conductors ?? [],
    conductorEnds: partial.conductorEnds ?? [],
    internalConnections: partial.internalConnections ?? [],
    sources: partial.sources ?? [],
    ...partial,
  };
}

function source(
  nodeId: string,
  circuitId: string,
  breakerPoleId: string,
  sourceGroupId?: string,
): { node: ElectricalNode; source: CircuitSource } {
  return {
    node: {
      id: nodeId,
      propertyId,
      kind: "source",
      certainty,
    },
    source: {
      id: `${nodeId}:source-record`,
      propertyId,
      circuitId,
      breakerPoleId,
      sourceGroupId,
      nodeId,
      certainty,
    },
  };
}

function wires(
  ...items: readonly ReturnType<typeof createConductorConnection>[]
): ElectricalTopology {
  return fragment({
    conductors: items.map((item) => item.conductor),
    conductorEnds: items.flatMap((item) => item.ends),
  });
}

function connect(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  electricalClass: "power" | "neutral" | "traveler" | "switched-power" =
    "power",
) {
  return createConductorConnection({
    propertyId,
    id,
    fromNodeId,
    toNodeId,
    electricalClass,
    certainty,
  });
}

describe("property-neutral electrical preset catalog", () => {
  test("covers the reusable device families without embedding property data", () => {
    assert.deepEqual(
      new Set(BUILT_IN_ELECTRICAL_PRESETS.map((preset) => preset.id)),
      new Set([
        "single-pole-switch",
        "multi-way-endpoint",
        "multi-way-intermediate",
        "duplex-receptacle",
        "split-duplex-receptacle",
        "gfci-receptacle",
        "smart-switch",
        "smart-aux-companion",
        "relay",
        "simple-light-fixture",
        "multi-lamp-fixture",
        "fan-light-fixture",
        "smart-bulb",
      ]),
    );

    for (const metadata of BUILT_IN_ELECTRICAL_PRESETS) {
      const definition = getBuiltInElectricalPreset(metadata.id, {
        lampCount: 3,
      });
      assert.equal("propertyId" in definition, false);
      assert.equal("assetId" in definition, false);
      assert.ok(definition.terminals.every((terminal) => !terminal.label.includes("property-preset")));

      const first = expandElectricalPreset(definition, {
        propertyId,
        assetId: `asset:${metadata.id}`,
      });
      const second = expandElectricalPreset(definition, {
        propertyId: "another-property",
        assetId: `asset:${metadata.id}`,
      });
      assert.ok(first.topology.nodes.every((node) => node.propertyId === propertyId));
      assert.ok(second.topology.nodes.every((node) => node.propertyId === "another-property"));
      assert.equal(validateTopology(first.topology).valid, true);
    }
  });

  test("rejects accidental cross-property composition", () => {
    const first = expandElectricalPreset(
      getBuiltInElectricalPreset("single-pole-switch"),
      { propertyId, assetId: "switch-a" },
    );
    const foreign = expandElectricalPreset(
      getBuiltInElectricalPreset("single-pole-switch"),
      { propertyId: "other-property", assetId: "switch-b" },
    );

    assert.throws(
      () =>
        mergeElectricalTopologies(
          propertyId,
          first.topology,
          foreign.topology,
        ),
      /cannot merge topology/i,
    );
  });
});

describe("switching and relay presets", () => {
  test("traces a single-pole switch to a fixture while stopping at the lamp load", () => {
    const switchPreset = expandElectricalPreset(
      getBuiltInElectricalPreset("single-pole-switch"),
      { propertyId, assetId: "switch-1", containingBoxId: "box-1", certainty },
    );
    const fixture = expandElectricalPreset(
      getBuiltInElectricalPreset("simple-light-fixture"),
      { propertyId, assetId: "fixture-1", containingBoxId: "fixture-box", certainty },
    );
    const supply = source("source-1", "circuit-1", "breaker-1");
    const topology = mergeElectricalTopologies(
      propertyId,
      switchPreset.topology,
      fixture.topology,
      fragment({ nodes: [supply.node], sources: [supply.source] }),
      wires(
        connect("line-feed", supply.node.id, switchPreset.terminalNodeIds.line),
        connect(
          "switched-leg",
          switchPreset.terminalNodeIds.load,
          fixture.terminalNodeIds.line,
          "switched-power",
        ),
      ),
    );

    const trace = traceTopology(topology, [
      { kind: "breaker-pole", id: "breaker-1" },
    ]);
    assert.deepEqual(trace.reached.assetIds, ["fixture-1", "switch-1"]);
    assert.ok(trace.stops.some((stop) => stop.reason === "load"));
    assert.equal(
      topology.internalConnections.filter(
        (connection) => connection.kind === "conditional-contact",
      ).length,
      1,
    );
  });

  test("uses endpoint and repeatable intermediate mechanisms for arbitrary n-way switching", () => {
    const endpoint = expandElectricalPreset(
      getBuiltInElectricalPreset("multi-way-endpoint"),
      { propertyId, assetId: "endpoint" },
    );
    const intermediate = expandElectricalPreset(
      getBuiltInElectricalPreset("multi-way-intermediate"),
      { propertyId, assetId: "intermediate" },
    );
    assert.deepEqual(
      endpoint.topology.nodes.map((node) => node.terminalRole).sort(),
      ["COMMON", "TRAVELER_1", "TRAVELER_2"],
    );
    assert.equal(intermediate.topology.internalConnections.length, 4);
    assert.deepEqual(
      new Set(
        intermediate.topology.internalConnections.map(
          (connection) => connection.contactState,
        ),
      ),
      new Set(["straight", "cross"]),
    );

    for (const controllerCount of [2, 5, 13]) {
      const arrangement = generateMultiWayPreset({
        propertyId,
        controllerCount,
        idPrefix: `arbitrary-${controllerCount}`,
        certainty,
      });
      assert.equal(arrangement.controllers.length, controllerCount);
      assert.equal(
        arrangement.controllers.filter(
          (controller) => controller.role === "intermediate",
        ).length,
        controllerCount - 2,
      );
      const trace = traceTopology(arrangement.topology, [
        {
          kind: "breaker-pole",
          id: `arbitrary-${controllerCount}:breaker-pole`,
        },
      ]);
      assert.ok(trace.reached.assetIds.includes(arrangement.loadAssetId));
    }
  });

  test("keeps smart aux/data signaling distinct from mechanical travelers", () => {
    const endpoint = expandElectricalPreset(
      getBuiltInElectricalPreset("multi-way-endpoint"),
      { propertyId, assetId: "mechanical-endpoint", certainty },
    );
    const companion = expandElectricalPreset(
      getBuiltInElectricalPreset("smart-aux-companion"),
      { propertyId, assetId: "smart-companion", certainty },
    );
    const endpointGraph = buildTopologyGraph(endpoint.topology);
    const companionGraph = buildTopologyGraph(companion.topology);

    assert.ok(
      [...endpointGraph.edges.values()].every(
        (edge) => edge.relationshipKind === "conditional-contact",
      ),
    );
    assert.ok(
      [...companionGraph.edges.values()].every(
        (edge) =>
          edge.relationshipKind === "signal-only" &&
          edge.boundaryReason === "signal",
      ),
    );
    assert.equal(
      companion.topology.nodes.find(
        (node) => node.id === companion.terminalNodeIds["aux-data"],
      )?.terminalRole,
      "AUX",
    );
    assert.deepEqual(
      companion.controlInterfaces.map((item) => item.method),
      ["wired-auxiliary-data"],
    );
  });

  test("models relay power contacts separately from their control input", () => {
    const expanded = expandElectricalPreset(
      getBuiltInElectricalPreset("relay"),
      { propertyId, assetId: "relay-1", certainty },
    );
    const fromLine = traceTopology(expanded.topology, [
      { kind: "node", id: expanded.terminalNodeIds.line },
    ]);
    const fromControl = traceTopology(expanded.topology, [
      { kind: "node", id: expanded.terminalNodeIds.control },
    ]);

    assert.ok(fromLine.reached.nodeIds.includes(expanded.terminalNodeIds.load));
    assert.ok(
      fromControl.stops.some((stop) => stop.reason === "signal"),
    );
    assert.ok(
      !fromControl.reached.nodeIds.includes(expanded.terminalNodeIds.line),
    );
  });
});

describe("receptacle and fixture presets", () => {
  test("preserves connected versus broken duplex hot-tab state", () => {
    const duplex = expandElectricalPreset(
      getBuiltInElectricalPreset("duplex-receptacle"),
      { propertyId, assetId: "duplex" },
    );
    const split = expandElectricalPreset(
      getBuiltInElectricalPreset("split-duplex-receptacle"),
      { propertyId, assetId: "split" },
    );
    const duplexTrace = traceTopology(duplex.topology, [
      { kind: "node", id: duplex.terminalNodeIds["top-hot"] },
    ]);
    const splitTrace = traceTopology(split.topology, [
      { kind: "node", id: split.terminalNodeIds["top-hot"] },
    ]);

    assert.ok(
      duplexTrace.reached.nodeIds.includes(
        duplex.terminalNodeIds["bottom-hot"],
      ),
    );
    assert.ok(
      !splitTrace.reached.nodeIds.includes(split.terminalNodeIds["bottom-hot"]),
    );
    assert.ok(splitTrace.stops.some((stop) => stop.reason === "open-connection"));
    assert.equal(split.functionIds.top !== split.functionIds.bottom, true);
  });

  test("keeps GFCI LINE and LOAD explicit while allowing protected downstream tracing", () => {
    const gfci = expandElectricalPreset(
      getBuiltInElectricalPreset("gfci-receptacle"),
      { propertyId, assetId: "gfci-1", certainty },
    );
    const trace = traceTopology(gfci.topology, [
      { kind: "node", id: gfci.terminalNodeIds["line-hot"] },
    ]);

    assert.ok(trace.reached.nodeIds.includes(gfci.terminalNodeIds["load-hot"]));
    assert.ok(
      trace.reached.nodeIds.includes(gfci.terminalNodeIds["receptacle-hot"]),
    );
    assert.equal(
      gfci.topology.nodes.find(
        (node) => node.id === gfci.terminalNodeIds["load-hot"],
      )?.terminalRole,
      "LOAD",
    );
    assert.equal(gfci.protectionBoundaries.length, 1);
    assert.equal(
      gfci.protectionBoundaries[0]?.kind,
      "gfci-protected-feed-through",
    );
    assert.ok(!trace.stops.some((stop) => stop.reason === "isolation"));
  });

  test("generates every lamp holder and load boundary for a multi-lamp fixture", () => {
    const simple = expandElectricalPreset(
      getBuiltInElectricalPreset("simple-light-fixture"),
      { propertyId, assetId: "simple-fixture", certainty },
    );
    const multi = expandElectricalPreset(createMultiLampFixturePreset(7), {
      propertyId,
      assetId: "multi-fixture",
      certainty,
    });
    const simpleTrace = traceTopology(simple.topology, [
      { kind: "node", id: simple.terminalNodeIds.line },
    ]);
    const multiTrace = traceTopology(multi.topology, [
      { kind: "node", id: multi.terminalNodeIds.line },
    ]);

    assert.equal(simple.lampHolders.length, 1);
    assert.equal(simpleTrace.stops.filter((stop) => stop.reason === "load").length, 1);
    assert.equal(multi.lampHolders.length, 7);
    assert.equal(Object.keys(multi.functionIds).length, 7);
    assert.equal(
      multiTrace.stops.filter((stop) => stop.reason === "load").length,
      7,
    );
    assert.throws(() => createMultiLampFixturePreset(0), /at least one/i);
  });

  test("keeps fan and light as independently powered functions", () => {
    const fanLight = expandElectricalPreset(
      getBuiltInElectricalPreset("fan-light-fixture"),
      { propertyId, assetId: "fan-light", certainty },
    );
    const lightTrace = traceTopology(fanLight.topology, [
      { kind: "node", id: fanLight.terminalNodeIds["light-line"] },
    ]);

    assert.notEqual(fanLight.functionIds.light, fanLight.functionIds.fan);
    assert.ok(
      !lightTrace.reached.nodeIds.includes(
        fanLight.terminalNodeIds["fan-line"],
      ),
    );
    assert.equal(
      lightTrace.stops.filter((stop) => stop.reason === "load").length,
      1,
    );
  });
});

describe("logical control remains separate from physical power", () => {
  test("records a smart bulb power cutoff independently from wireless control", () => {
    const cutoff = expandElectricalPreset(
      getBuiltInElectricalPreset("single-pole-switch"),
      { propertyId, assetId: "power-cutoff", certainty },
    );
    const bulb = expandElectricalPreset(
      getBuiltInElectricalPreset("smart-bulb"),
      { propertyId, assetId: "smart-bulb-1", certainty },
    );
    const supply = source("smart-source", "smart-circuit", "smart-breaker");
    const controls = createManyToManyControlPreset({
      propertyId,
      idPrefix: "wireless-lighting",
      controllers: [{ functionId: "remote:function:button" }],
      loads: [{ functionId: bulb.functionIds.light }],
      method: "wireless-direct",
      certainty,
    });
    const topology = mergeElectricalTopologies(
      propertyId,
      cutoff.topology,
      bulb.topology,
      fragment({
        nodes: [supply.node],
        sources: [supply.source],
        controlGroups: [controls.group],
        controlMembers: controls.members,
        controlLinks: controls.links,
      }),
      wires(
        connect("smart-line-feed", supply.node.id, cutoff.terminalNodeIds.line),
        connect(
          "smart-cutoff-leg",
          cutoff.terminalNodeIds.load,
          bulb.terminalNodeIds.line,
          "switched-power",
        ),
      ),
    );
    const trace = traceTopology(topology, [
      { kind: "breaker-pole", id: "smart-breaker" },
    ]);

    assert.ok(trace.reached.assetIds.includes("power-cutoff"));
    assert.ok(trace.reached.assetIds.includes("smart-bulb-1"));
    assert.equal(topology.controlLinks?.[0]?.method, "wireless-direct");
    assert.ok(
      !trace.traversedEdges.some(
        (edge) => edge.relationshipId === controls.links[0].id,
      ),
      "logical control must never become a power-continuity edge",
    );
  });

  test("builds an unconstrained many-controller to many-fixture control graph", () => {
    const controllers = Array.from({ length: 8 }, (_, index) => ({
      functionId: `controller:${index}:function`,
    }));
    const loads = Array.from({ length: 5 }, (_, index) => ({
      functionId: `fixture:${index}:function`,
    }));
    const group = createManyToManyControlPreset({
      propertyId,
      idPrefix: "many-to-many",
      controllers,
      loads,
      method: "scene-automation",
    });

    assert.equal(group.members.length, controllers.length + loads.length);
    assert.equal(group.links.length, controllers.length * loads.length);
    for (const controller of controllers) {
      assert.equal(
        group.links.filter(
          (link) => link.fromFunctionId === controller.functionId,
        ).length,
        loads.length,
      );
    }
  });
});

describe("multi-circuit and panel relationship semantics", () => {
  test("keeps two circuits in one gang box separate and reports both for a box trace", () => {
    const switchA = expandElectricalPreset(
      getBuiltInElectricalPreset("single-pole-switch"),
      { propertyId, assetId: "gang-switch-a", containingBoxId: "shared-gang", certainty },
    );
    const switchB = expandElectricalPreset(
      getBuiltInElectricalPreset("single-pole-switch"),
      { propertyId, assetId: "gang-switch-b", containingBoxId: "shared-gang", certainty },
    );
    const fixtureA = expandElectricalPreset(
      getBuiltInElectricalPreset("simple-light-fixture"),
      { propertyId, assetId: "gang-fixture-a", certainty },
    );
    const fixtureB = expandElectricalPreset(
      getBuiltInElectricalPreset("simple-light-fixture"),
      { propertyId, assetId: "gang-fixture-b", certainty },
    );
    const a = source("gang-source-a", "gang-circuit-a", "gang-breaker-a");
    const b = source("gang-source-b", "gang-circuit-b", "gang-breaker-b");
    const topology = mergeElectricalTopologies(
      propertyId,
      switchA.topology,
      switchB.topology,
      fixtureA.topology,
      fixtureB.topology,
      fragment({ nodes: [a.node, b.node], sources: [a.source, b.source] }),
      wires(
        connect("gang-feed-a", a.node.id, switchA.terminalNodeIds.line),
        connect("gang-load-a", switchA.terminalNodeIds.load, fixtureA.terminalNodeIds.line, "switched-power"),
        connect("gang-feed-b", b.node.id, switchB.terminalNodeIds.line),
        connect("gang-load-b", switchB.terminalNodeIds.load, fixtureB.terminalNodeIds.line, "switched-power"),
      ),
    );
    const breakerATrace = traceTopology(topology, [
      { kind: "breaker-pole", id: "gang-breaker-a" },
    ]);
    const boxTrace = traceTopology(topology, [
      { kind: "box", id: "shared-gang" },
    ]);

    assert.ok(breakerATrace.reached.assetIds.includes("gang-switch-a"));
    assert.ok(breakerATrace.reached.assetIds.includes("gang-fixture-a"));
    assert.ok(!breakerATrace.reached.assetIds.includes("gang-switch-b"));
    assert.deepEqual(
      new Set(boxTrace.reached.circuitIds),
      new Set(["gang-circuit-a", "gang-circuit-b"]),
    );
    assert.equal(boxTrace.conflicts[0]?.code, "MULTIPLE_SOURCE_GROUPS");
  });

  test("uses one source group for related poles and stores shared-neutral membership without inventing continuity", () => {
    const sharedNeutral = createSharedNeutralPreset({
      propertyId,
      idPrefix: "multiwire",
      circuitIds: ["leg-a", "leg-b"],
      conductorIds: ["shared-neutral-conductor"],
      certainty,
    });
    const a = source(
      "leg-a-source",
      "leg-a",
      "pole-a",
      sharedNeutral.sourceGroupId,
    );
    const b = source(
      "leg-b-source",
      "leg-b",
      "pole-b",
      sharedNeutral.sourceGroupId,
    );
    const lineA: ElectricalNode = {
      id: "two-pole-load:a",
      propertyId,
      kind: "terminal",
      ownerAssetId: "two-pole-load",
      certainty,
    };
    const lineB: ElectricalNode = {
      id: "two-pole-load:b",
      propertyId,
      kind: "terminal",
      ownerAssetId: "two-pole-load",
      certainty,
    };
    const neutralWire = connect(
      "shared-neutral-conductor",
      "neutral-end-a",
      "neutral-end-b",
      "neutral",
    );
    const topology = mergeElectricalTopologies(
      propertyId,
      fragment({
        nodes: [
          a.node,
          b.node,
          lineA,
          lineB,
          { id: "neutral-end-a", propertyId, kind: "junction", certainty },
          { id: "neutral-end-b", propertyId, kind: "junction", certainty },
        ],
        sources: [a.source, b.source],
        sharedNeutralGroups: [sharedNeutral.group],
        sharedNeutralMembers: sharedNeutral.members,
      }),
      wires(
        connect("leg-a-feed", a.node.id, lineA.id),
        connect("leg-b-feed", b.node.id, lineB.id),
        neutralWire,
      ),
    );
    const trace = traceTopology(topology, [
      { kind: "asset", id: "two-pole-load" },
    ]);

    assert.deepEqual(new Set(trace.reached.circuitIds), new Set(["leg-a", "leg-b"]));
    assert.equal(trace.conflicts.length, 0);
    assert.equal(trace.warnings.length, 0);
    assert.equal(topology.sharedNeutralMembers?.length, 3);
    assert.ok(
      !trace.reached.conductorIds.includes("shared-neutral-conductor"),
      "membership metadata must not create a graph edge",
    );
  });

  test("records a subpanel feeder without treating panel metadata as a branch-circuit wire", () => {
    const upstream = source(
      "feeder-source",
      "feeder-circuit",
      "feeder-breaker",
    );
    const downstream = source(
      "branch-source",
      "branch-circuit",
      "branch-breaker",
    );
    const panelFeeder = createPanelFeederPreset({
      propertyId,
      idPrefix: "garage-panel-feed",
      upstreamCircuitId: upstream.source.circuitId,
      downstreamPanelAssetId: "subpanel-asset",
    });
    const topology = fragment({
      nodes: [upstream.node, downstream.node],
      sources: [upstream.source, downstream.source],
      panelFeeders: [panelFeeder],
    });
    const trace = traceTopology(topology, [
      { kind: "circuit", id: "feeder-circuit" },
    ]);

    assert.deepEqual(trace.reached.circuitIds, ["feeder-circuit"]);
    assert.equal(topology.panelFeeders?.[0]?.downstreamPanelAssetId, "subpanel-asset");
    assert.ok(!trace.reached.circuitIds.includes("branch-circuit"));
  });
});
