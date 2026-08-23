// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssetEditor,
  EMPTY_ASSET_DRAFT,
  filterInventory,
  type InventoryAsset,
  type InventoryFilterState,
} from "@/features/inventory";

afterEach(cleanup);

const assets: InventoryAsset[] = [
  {
    id: "switch-1",
    permanentCode: "DEV-0001",
    displayName: "Entry controller",
    kind: "switch",
    locationLabel: "Entry",
    verification: "observed",
    smartState: "smart",
    breakerReferences: [],
    installedProduct: { manufacturer: "ExampleCo", protocol: "Matter" },
    tags: ["arrival"],
  },
  {
    id: "fixture-1",
    permanentCode: "FIX-0001",
    displayName: "Reading lamp",
    kind: "fixture",
    locationLabel: "Study",
    verification: "unknown",
    smartState: "dumb",
    breakerReferences: [],
  },
];

describe("inventory components", () => {
  it("searches product details and applies review filters", () => {
    const matterFilters: InventoryFilterState = {
      query: "matter",
      kind: "all",
      smartState: "all",
      locationId: "all",
      needsReviewOnly: false,
    };
    expect(filterInventory(assets, matterFilters).map((asset) => asset.id)).toEqual(["switch-1"]);
    expect(
      filterInventory(assets, { ...matterFilters, query: "", needsReviewOnly: true }).map(
        (asset) => asset.id,
      ),
    ).toEqual(["fixture-1"]);
  });

  it("adds independently tracked light sources to fixture drafts", () => {
    const onChange = vi.fn();
    render(
      <AssetEditor
        draft={{ ...EMPTY_ASSET_DRAFT, kind: "fixture", displayName: "Ceiling fixture" }}
        locationOptions={[]}
        breakerOptions={[]}
        onChange={onChange}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add light source" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].lightSources).toHaveLength(1);
    expect(onChange.mock.calls[0][0].lightSources[0].smartState).toBe("unknown");
  });

  it("captures actual and equivalent bulb ratings plus a tunable temperature range", () => {
    const onSave = vi.fn();
    function Harness() {
      const [draft, setDraft] = useState({
        ...EMPTY_ASSET_DRAFT,
        kind: "fixture" as const,
        displayName: "Fictional ceiling fixture",
        lightSources: [{
          id: "draft-bulb",
          holderLabel: "Lamp 1",
          sourceType: "replaceable" as const,
          smartState: "smart" as const,
          dimmable: null,
        }],
      });
      return <AssetEditor draft={draft} locationOptions={[]} breakerOptions={[]} onChange={setDraft} onSave={onSave} onCancel={vi.fn()} />;
    }
    render(<Harness />);

    fireEvent.change(screen.getByRole("spinbutton", { name: /^Actual wattage/ }), { target: { value: "8.5" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Wattage equivalent/ }), { target: { value: "60" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Light output (lumens)" }), { target: { value: "800" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum supported temperature (K)" }), { target: { value: "2200" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Maximum supported temperature/ }), { target: { value: "2000" } });
    expect(screen.getByText("Maximum must be at least the minimum.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save record" })).toBeDisabled();

    fireEvent.change(screen.getByRole("spinbutton", { name: /^Maximum supported temperature/ }), { target: { value: "6500" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Color capability" }), { target: { value: "tunable-white" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Dimmable" }), { target: { value: "yes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save record" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      lightSources: [expect.objectContaining({
        wattage: 8.5,
        equivalentWattage: 60,
        lumens: 800,
        colorTemperatureMinKelvin: 2200,
        colorTemperatureMaxKelvin: 6500,
        colorCapability: "tunable-white",
        dimmable: true,
      })],
    }));
  });

  it("can limit record types to aggregate workflows supported by a caller", () => {
    render(
      <AssetEditor
        allowedKinds={["switch", "fixture", "box"]}
        draft={{ ...EMPTY_ASSET_DRAFT, displayName: "New record" }}
        locationOptions={[]}
        breakerOptions={[]}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const typeSelect = screen.getByRole("combobox", { name: "Record type" });
    expect(typeSelect).toHaveTextContent("Switch / controller");
    expect(typeSelect).toHaveTextContent("Light / fixture");
    expect(typeSelect).toHaveTextContent("Box");
    expect(typeSelect).not.toHaveTextContent("Panel");
    expect(typeSelect).not.toHaveTextContent("Cable");
    expect(typeSelect).not.toHaveTextContent("Light source");
  });
});
