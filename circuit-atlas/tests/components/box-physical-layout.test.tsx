// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BoxPhysicalLayout,
  BoxPhysicalLayoutEditor,
  getBoxDiagramGeometry,
  getBoxLayoutWarnings,
  type BoxPhysicalLayoutModel,
} from "../../features/boxes";

const layout: BoxPhysicalLayoutModel = {
  id: "box-fixture",
  permanentCode: "BOX-9001",
  label: "Fictional test switch bank",
  gangCount: 7,
  orientation: "wall-front",
  boxType: "wall box",
  material: "metal",
  mounts: [
    {
      id: "mount-one",
      assetId: "device-one",
      permanentCode: "DEV-9001",
      label: "Test dimmer",
      kind: "smart dimmer",
      gangStart: 1,
      gangSpan: 1,
    },
    {
      id: "mount-wide",
      assetId: "device-wide",
      permanentCode: "DEV-9002",
      label: "Wide test controller",
      kind: "switch",
      gangStart: 3,
      gangSpan: 3,
      rotationDegrees: 90,
    },
  ],
  cableEntries: [
    {
      id: "entry-top",
      side: "top",
      offset: 0.18,
      knockoutLabel: "Top opening A",
      cables: [
        {
          cableId: "cable-one",
          cableEndId: "cable-end-one",
          permanentCode: "CBL-9001",
        },
      ],
    },
    {
      id: "entry-back",
      side: "back",
      offset: 0.72,
      approachAngleDegrees: 35,
      knockoutLabel: "Shared back opening",
      cables: [
        {
          cableId: "cable-two",
          cableEndId: "cable-end-two",
          permanentCode: "CBL-9002",
        },
        {
          cableId: "cable-three",
          cableEndId: "cable-end-three",
          permanentCode: "CBL-9003",
        },
      ],
    },
  ],
};

describe("box physical-layout geometry", () => {
  it("scales to arbitrary gang counts without a fixed upper bound", () => {
    const seven = getBoxDiagramGeometry(7);
    const nineteen = getBoxDiagramGeometry(19);

    expect(nineteen.boxWidth).toBeGreaterThan(seven.boxWidth);
    expect(nineteen.gangWidth).toBe(seven.gangWidth);
  });

  it("reports invalid spans and overlap instead of hiding them", () => {
    const warnings = getBoxLayoutWarnings({
      ...layout,
      mounts: [
        layout.mounts[0],
        { ...layout.mounts[1], gangStart: 1, gangSpan: 8 },
      ],
    });

    expect(warnings.join(" ")).toMatch(/outside the 7-gang box/i);
  });
});

describe("BoxPhysicalLayout", () => {
  it("renders selectable SVG elements and a complete textual equivalent", () => {
    const onSelect = vi.fn();
    render(<BoxPhysicalLayout model={layout} onSelect={onSelect} />);

    expect(
      screen.getByRole("group", { name: /fictional test switch bank physical box layout/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/gang numbers run left-to-right/i)).toBeVisible();

    const deviceTable = screen.getByRole("table", { name: "Mounted devices" });
    expect(within(deviceTable).getByText("Gangs 3–5")).toBeVisible();
    expect(within(deviceTable).getByText("Wide test controller")).toBeVisible();

    const cableTable = screen.getByRole("table", { name: "Cable entries" });
    expect(within(cableTable).getByText("CBL-9002, CBL-9003")).toBeVisible();
    expect(within(cableTable).getByText("back, 72%")).toBeVisible();

    const backEntry = screen.getByRole("button", {
      name: /shared back opening; 2 cables: CBL-9002, CBL-9003/i,
    });
    fireEvent.click(backEntry);
    expect(onSelect).toHaveBeenCalledWith({ kind: "cable-entry", id: "entry-back" });
  });
});

describe("BoxPhysicalLayoutEditor", () => {
  it("supports keyboard nudging and precise numeric entry", () => {
    const onChange = vi.fn();
    render(<BoxPhysicalLayoutEditor model={layout} onChange={onChange} />);

    const topEntry = screen.getByRole("button", {
      name: /top opening A; 1 cable: CBL-9001/i,
    });
    fireEvent.keyDown(topEntry, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cableEntries: expect.arrayContaining([
          expect.objectContaining({ id: "entry-top", offset: 0.19 }),
        ]),
      }),
      { kind: "cable-entry", field: "offset", id: "entry-top" },
    );

    fireEvent.change(screen.getByLabelText("Wide test controller gang span"), {
      target: { value: "4" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mounts: expect.arrayContaining([
          expect.objectContaining({ id: "mount-wide", gangSpan: 4 }),
        ]),
      }),
      { kind: "mount", field: "gangSpan", id: "mount-wide" },
    );
  });
});
