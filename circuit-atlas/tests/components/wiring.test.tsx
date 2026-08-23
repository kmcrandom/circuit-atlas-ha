// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  fallbackTopologyLayout,
  legendItemsForModel,
  summarizeTopology,
  TopologyCanvas,
  TraceTable,
  type TopologyVisualModel,
} from "../../features/wiring";

function multiWayView(controllerCount: number): TopologyVisualModel {
  const controllers = Array.from({ length: controllerCount }, (_, index) => ({
    id: `controller-${index + 1}`,
    selection: {
      entityId: `device-${index + 1}`,
      entityKind: "switch" as const,
    },
    kind: "switch" as const,
    label: `Controller ${index + 1}`,
    code: `SW-${index + 1}`,
    confidence: "test-verified" as const,
  }));
  const nodes = [
    {
      id: "source",
      selection: { entityId: "breaker-1", entityKind: "breaker" as const },
      kind: "breaker" as const,
      label: "Source breaker",
      isRoot: true,
      isSource: true,
      confidence: "test-verified" as const,
    },
    ...controllers,
    {
      id: "load",
      selection: { entityId: "fixture-1", entityKind: "fixture" as const },
      kind: "fixture" as const,
      label: "Controlled fixture",
      confidence: "inferred" as const,
    },
  ];
  const chain = nodes.map((node) => node.id);
  const edges = chain.slice(0, -1).map((source, index) => ({
    id: `connection-${index + 1}`,
    source,
    target: chain[index + 1],
    relationship:
      index > 0 && index < chain.length - 2
        ? ("conditional-contact" as const)
        : ("conductor" as const),
    label:
      index > 0 && index < chain.length - 2
        ? "Possible contact"
        : "Recorded conductor",
    possibleStateLabel:
      index > 0 && index < chain.length - 2
        ? "Possible in a valid switch state"
        : undefined,
    confidence: "test-verified" as const,
  }));

  return {
    id: "multi-way-trace",
    propertyId: "property-fixture",
    title: "Multi-way trace",
    focusNodeId: "load",
    sourceNodeIds: ["source"],
    nodes,
    edges,
    issues: [
      {
        id: "gap-1",
        kind: "gap",
        title: "Unresolved endpoint",
        detail: "One documented endpoint has not been identified.",
      },
      {
        id: "conflict-1",
        kind: "conflict",
        title: "Source conflict",
        detail: "The manual assertion and graph-derived source differ.",
      },
    ],
  };
}

describe("wiring visualization contract", () => {
  it("lays out an arbitrary number of controllers without a count-specific case", () => {
    const model = multiWayView(9);
    const layout = fallbackTopologyLayout(model);

    expect(layout.positions.size).toBe(model.nodes.length);
    expect(layout.positions.get("controller-9")).toBeDefined();
    expect(layout.positions.get("load")?.x).toBeGreaterThan(
      layout.positions.get("source")?.x ?? 0,
    );
  });

  it("explains possible switch states, gaps, conflicts, and source identity plainly", () => {
    const summary = summarizeTopology(multiWayView(6));

    expect(summary.heading).toBe("Trace from Controlled fixture");
    expect(summary.statements.join(" ")).toMatch(/identified source is Source breaker/i);
    expect(summary.statements.join(" ")).toMatch(/possible switch-state/i);
    expect(summary.statements.join(" ")).toMatch(/1 unresolved gap/i);
    expect(summary.statements.join(" ")).toMatch(/1 conflict/i);
    expect(summary.caution).toMatch(/does not show whether conductors are energized/i);
  });

  it("includes legend entries for the relationships and review states present", () => {
    const items = legendItemsForModel(multiWayView(4));
    const labels = items.map((item) => item.label);

    expect(labels).toContain("Physical conductor");
    expect(labels).toContain("Possible switch state");
    expect(labels).toContain("Unresolved gap");
    expect(labels).toContain("Conflict");
  });
});

describe("TraceTable", () => {
  it("provides a keyboard-focusable text equivalent and synchronized selection", () => {
    const model = multiWayView(5);
    const onSelectionChange = vi.fn();
    render(
      <TraceTable
        model={model}
        selected={null}
        onSelectionChange={onSelectionChange}
      />,
    );

    const table = screen.getByRole("table", {
      name: /text equivalent of every connection/i,
    });
    expect(within(table).getAllByRole("row")).toHaveLength(
      model.edges.length + 1,
    );

    const controllerButton = screen.getAllByRole("button", {
      name: /controller 5/i,
    })[0];
    controllerButton.focus();
    expect(controllerButton).toHaveFocus();
    fireEvent.click(controllerButton);

    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "device-5",
        entityKind: "switch",
        visualId: "controller-5",
      }),
      { origin: "trace-table" },
    );
    expect(screen.getByRole("heading", { name: "Needs review" })).toBeVisible();
  });
});

describe("TopologyCanvas", () => {
  it("renders a useful empty state without loading a browser layout engine", () => {
    const model = multiWayView(0);
    const empty = { ...model, nodes: [], edges: [], sourceNodeIds: [] };

    render(<TopologyCanvas model={empty} />);

    expect(screen.getByText("No wiring records in this trace")).toBeVisible();
  });
});
