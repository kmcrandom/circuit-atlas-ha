// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FloorPlanMap,
  getActiveFloorPlanFilterCount,
  matchesFloorPlanFilters,
  normalizeFloorPlanViewport,
  type FloorPlanBackground,
  type FloorPlanPlacement,
} from "../../features/map";

const background: FloorPlanBackground = {
  id: "plan-fixture",
  kind: "pdf-page",
  name: "Fictional upper-level plan",
  src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'/%3E",
  alt: "Line drawing used only for automated tests",
  intrinsicWidth: 1200,
  intrinsicHeight: 800,
  pageNumber: 4,
};

const placements: readonly FloorPlanPlacement[] = [
  {
    id: "placement-switch",
    assetId: "asset-switch",
    permanentCode: "DEV-9101",
    label: "Fictional wall switch",
    kind: "switch",
    x: 0.2,
    y: 0.35,
    roomId: "room-a",
    roomLabel: "Test room A",
    breakerIds: ["breaker-a"],
    circuitIds: ["circuit-a"],
    smartState: "dumb",
    confidence: "observed",
  },
  {
    id: "placement-light",
    assetId: "asset-light",
    permanentCode: "FIX-9101",
    label: "Fictional ceiling light",
    kind: "fixture",
    x: 0.62,
    y: 0.42,
    roomId: "room-a",
    roomLabel: "Test room A",
    breakerIds: ["breaker-a"],
    circuitIds: ["circuit-a"],
    smartState: "smart",
    confidence: "verified",
  },
  {
    id: "placement-panel",
    assetId: "asset-panel",
    permanentCode: "PNL-9101",
    label: "Fictional panel",
    kind: "panel",
    x: 0.85,
    y: 0.78,
    roomId: "room-b",
    roomLabel: "Test room B",
    breakerIds: ["breaker-b"],
    confidence: "inferred",
  },
];

describe("floor-plan data helpers", () => {
  it("filters by breaker, type, room, smart state, confidence, and search text", () => {
    expect(
      matchesFloorPlanFilters(placements[1], {
        breakerIds: ["breaker-a"],
        kinds: ["fixture"],
        roomIds: ["room-a"],
        smartStates: ["smart"],
        confidences: ["verified"],
        query: "ceiling",
      }),
    ).toBe(true);
    expect(matchesFloorPlanFilters(placements[2], { breakerIds: ["breaker-a"] })).toBe(false);
    expect(getActiveFloorPlanFilterCount({ breakerIds: ["breaker-a"], query: "light" })).toBe(2);
  });

  it("keeps the viewport inside the plan at any supported zoom", () => {
    expect(normalizeFloorPlanViewport({ zoom: 4, centerX: -2, centerY: 3 })).toEqual({
      zoom: 4,
      centerX: 0.125,
      centerY: 0.875,
    });
  });
});

describe("FloorPlanMap", () => {
  it("renders a PDF-page background overlay, filters, and a plainly labeled schematic connection", () => {
    render(
      <FloorPlanMap
        background={background}
        connections={[
          {
            id: "connection-a",
            fromPlacementId: "placement-switch",
            toPlacementId: "placement-light",
            kind: "control",
            label: "Controls",
          },
        ]}
        filters={{ breakerIds: ["breaker-a"] }}
        placements={placements}
        showConnections
      />,
    );

    expect(screen.getByText("Connection only — concealed route unknown")).toBeVisible();
    expect(screen.getByText("PDF page 4")).toBeVisible();
    expect(screen.getByText("2 of 3 items shown")).toBeVisible();
    expect(screen.queryByRole("button", { name: /fictional panel/i })).not.toBeInTheDocument();

    const placementTable = screen.getByRole("table", { name: "Placement details" });
    expect(within(placementTable).getByText("Fictional wall switch")).toBeVisible();
    expect(within(placementTable).getByText("Fictional ceiling light")).toBeVisible();
    expect(
      screen.getByRole("table", {
        name: "Shown schematic connections — concealed route unknown",
      }),
    ).toBeVisible();
  });

  it("synchronizes selection and supports keyboard plus numeric placement", () => {
    const onSelectPlacement = vi.fn();
    const onPlacementChange = vi.fn();
    render(
      <FloorPlanMap
        background={background}
        editable
        onPlacementChange={onPlacementChange}
        onSelectPlacement={onSelectPlacement}
        placements={placements}
      />,
    );

    const switchMarker = screen.getByRole("button", {
      name: /fictional wall switch, DEV-9101, switch/i,
    });
    fireEvent.keyDown(switchMarker, { key: "ArrowRight" });
    expect(onPlacementChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "placement-switch", x: 0.205, y: 0.35 }),
      { id: "placement-switch", field: "position", source: "keyboard" },
    );

    fireEvent.keyDown(switchMarker, { key: "Enter" });
    expect(onSelectPlacement).toHaveBeenCalledWith("placement-switch");

    fireEvent.change(screen.getByLabelText("Fictional ceiling light x position percent"), {
      target: { value: "73.5" },
    });
    expect(onPlacementChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "placement-light", x: 0.735 }),
      { id: "placement-light", field: "position", source: "numeric" },
    );
  });

  it("offers keyboard pan and zoom controls without requiring pointer gestures", () => {
    const onViewportChange = vi.fn();
    render(
      <FloorPlanMap
        background={background}
        onViewportChange={onViewportChange}
        placements={placements}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(onViewportChange).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 1.25 }),
    );

    const canvas = screen.getByRole("group", {
      name: /fictional upper-level plan interactive floor plan/i,
    });
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(onViewportChange).toHaveBeenCalled();
  });
});
