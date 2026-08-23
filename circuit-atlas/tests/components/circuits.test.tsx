// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BreakerDetail,
  groupConnectedAssets,
  type BreakerSummary,
  type ConnectedAsset,
} from "@/features/circuits";

afterEach(cleanup);

const assets: ConnectedAsset[] = [
  {
    id: "fixture-1",
    permanentCode: "FIX-0001",
    name: "Ceiling light",
    kind: "fixture",
    locationLabel: "Studio",
    relationship: "switched-load",
    source: "graph",
    verification: "observed",
  },
  {
    id: "switch-1",
    permanentCode: "DEV-0001",
    name: "Door switch",
    kind: "switch",
    locationLabel: "Studio",
    relationship: "controller",
    source: "both",
    verification: "test-verified",
  },
  {
    id: "receptacle-1",
    permanentCode: "DEV-0002",
    name: "Unplaced receptacle",
    kind: "receptacle",
    relationship: "manually-associated",
    source: "assertion",
    verification: "unknown",
    traceHasGap: true,
  },
];

const breaker: BreakerSummary = {
  id: "breaker-1",
  permanentCode: "BRK-0001",
  label: "Studio receptacles and lights",
  panelId: "panel-1",
  panelName: "Main distribution",
  positionLabels: ["B12"],
  amperage: 15,
  poles: 1,
  protection: "afci",
  verification: "test-verified",
  recordedState: "recorded-off",
  circuits: [{ id: "circuit-1", permanentCode: "CKT-0001", name: "Studio branch" }],
};

describe("circuit components", () => {
  it("groups connected records by location and type, with unknown locations last", () => {
    const groups = groupConnectedAssets(assets);
    expect(groups.map((group) => group.location)).toEqual(["Studio", "Location not recorded"]);
    expect(groups[0].count).toBe(2);
    expect(groups[0].kinds.flatMap((kind) => kind.assets).map((asset) => asset.id).sort()).toEqual([
      "fixture-1",
      "switch-1",
    ]);
  });

  it("shows a breaker state as recorded and selects a connected asset", () => {
    const onSelectAsset = vi.fn();
    render(
      <BreakerDetail
        breaker={breaker}
        connectedAssets={assets}
        onSelectAsset={onSelectAsset}
      />,
    );

    expect(screen.getByText("Recorded off")).toBeTruthy();
    expect(screen.getByText("Traced + asserted")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Door switch/ }));
    expect(onSelectAsset).toHaveBeenCalledWith("switch-1");
  });
});
