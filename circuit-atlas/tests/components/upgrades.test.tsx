// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UpgradeReadinessBoard,
  type UpgradePlanItem,
} from "@/features/upgrades";

afterEach(cleanup);

const item: UpgradePlanItem = {
  id: "upgrade-1",
  assetId: "switch-1",
  upgradePermanentCode: "UPG-0001",
  permanentCode: "DEV-0001",
  goal: "Add smart dimming while preserving local control",
  displayName: "Hall controller",
  kind: "switch",
  locationLabel: "Hall",
  status: "candidate",
  current: { smartState: "dumb", manufacturer: "CurrentCo", model: "Toggle" },
  planned: { smartState: "smart", manufacturer: "FutureCo", model: "Matter Dimmer", protocol: "Matter" },
  requirements: [
    { id: "neutral", label: "Neutral observed", state: "known", observedValue: "Present" },
    { id: "line-load", label: "Line and load identified", state: "unknown" },
  ],
};

describe("upgrade readiness board", () => {
  it("keeps current and planned products distinct and updates workflow status", () => {
    const onStatusChange = vi.fn();
    render(
      <UpgradeReadinessBoard
        items={[item]}
        filter="all"
        onFilterChange={vi.fn()}
        onSelectItem={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByText("CurrentCo Toggle")).toBeTruthy();
    expect(screen.getByText("FutureCo Matter Dimmer")).toBeTruthy();
    expect(screen.getByText("Add smart dimming while preserving local control")).toBeTruthy();
    expect(screen.getAllByText("Needs facts").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Upgrade status for Hall controller"), {
      target: { value: "planned" },
    });
    expect(onStatusChange).toHaveBeenCalledWith("upgrade-1", "planned");
  });
});
