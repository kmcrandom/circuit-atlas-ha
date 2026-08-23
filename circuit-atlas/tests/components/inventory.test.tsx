// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
