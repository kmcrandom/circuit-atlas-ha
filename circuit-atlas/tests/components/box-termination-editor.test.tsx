// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  BoxTerminationEditor,
  BoxTerminationView,
  type BoxConductorRecord,
  type BoxTerminationModel,
} from "../../features/boxes";

const conductors: BoxConductorRecord[] = [
  {
    id: "conductor-feed",
    permanentCode: "COND-9001",
    cableId: "cable-feed",
    cablePermanentCode: "CBL-9001",
    kind: "cable-core",
    observedInsulationColor: "white",
    reidentificationMarking: "black tape at both ends",
    assignedFunction: "line",
    gauge: "12 AWG",
  },
  {
    id: "conductor-pigtail",
    permanentCode: "COND-9002",
    kind: "pigtail",
    observedInsulationColor: "black",
    assignedFunction: "line",
  },
  {
    id: "conductor-jumper",
    permanentCode: "COND-9003",
    kind: "jumper",
    observedInsulationColor: "red",
    assignedFunction: "traveler-1",
    gauge: null,
  },
  {
    id: "conductor-lead",
    permanentCode: "COND-9004",
    kind: "device-lead",
    observedInsulationColor: "blue",
    assignedFunction: "load",
  },
  {
    id: "conductor-ground",
    permanentCode: "COND-9005",
    kind: "equipment-ground",
    observedInsulationColor: "bare copper",
    assignedFunction: "ground",
    gauge: "12 AWG",
  },
];

const model: BoxTerminationModel = {
  boxId: "box-test",
  permanentCode: "BOX-9001",
  label: "Fictional test switch box",
  terminals: [
    {
      id: "node-terminal-line",
      owningAssetId: "device-switch",
      assetPermanentCode: "DEV-9001",
      assetLabel: "Test smart switch",
      terminalKey: "LINE",
      manufacturerLabel: "Line / hot",
      semanticRole: "LINE",
      terminalGroup: "Power",
    },
    {
      id: "node-terminal-load",
      owningAssetId: "device-switch",
      assetPermanentCode: "DEV-9001",
      assetLabel: "Test smart switch",
      terminalKey: "LOAD",
      manufacturerLabel: "Load",
      semanticRole: "LOAD",
      terminalGroup: "Power",
    },
  ],
  splices: [
    {
      id: "node-splice-line",
      label: "Always-hot splice",
      connectorType: "three-port lever connector",
    },
  ],
  openEndpoints: [
    {
      id: "node-capped",
      endpointKind: "capped",
      label: "Capped spare",
      description: "Individual wirenut observed",
    },
    {
      id: "node-open",
      endpointKind: "unconnected",
      label: "Open traveler",
    },
    {
      id: "node-unknown",
      endpointKind: "unknown",
      label: "Unknown loose end",
    },
  ],
  bondPoints: [
    {
      id: "node-box-bond",
      label: "Metal box bond",
      ownerLabel: "BOX-9001",
      description: "Green grounding screw",
    },
  ],
  conductors,
  conductorEnds: [
    { id: "end-feed-a", conductorId: "conductor-feed", designation: "A", nodeId: "node-splice-line", terminationMethod: "lever-connector", certainty: "visually-observed" },
    { id: "end-feed-b", conductorId: "conductor-feed", designation: "B", nodeId: "node-capped", terminationMethod: "wirenut", certainty: "visually-observed" },
    { id: "end-pigtail-a", conductorId: "conductor-pigtail", designation: "A", nodeId: "node-splice-line", terminationMethod: "lever-connector", certainty: "test-verified" },
    { id: "end-pigtail-b", conductorId: "conductor-pigtail", designation: "B", nodeId: "node-terminal-line", terminationMethod: "screw", certainty: "test-verified" },
    { id: "end-jumper-a", conductorId: "conductor-jumper", designation: "A", nodeId: "node-terminal-load", terminationMethod: "screw", certainty: "inferred" },
    { id: "end-jumper-b", conductorId: "conductor-jumper", designation: "B", nodeId: "node-open", terminationMethod: "open", certainty: "unknown" },
    { id: "end-lead-a", conductorId: "conductor-lead", designation: "A", nodeId: "node-terminal-load", terminationMethod: "integral", certainty: "documentation-verified" },
    { id: "end-lead-b", conductorId: "conductor-lead", designation: "B", nodeId: "node-unknown", terminationMethod: "unknown", certainty: "unknown" },
    { id: "end-ground-a", conductorId: "conductor-ground", designation: "A", nodeId: "node-box-bond", terminationMethod: "screw", certainty: "visually-observed" },
    { id: "end-ground-b", conductorId: "conductor-ground", designation: "B", nodeId: null, terminationMethod: "unknown", certainty: "unknown" },
  ],
};

describe("BoxTerminationView", () => {
  it("renders every structured connection class and both conductor ends", () => {
    render(<BoxTerminationView model={model} />);

    expect(screen.getByRole("region", { name: /fictional test switch box structured terminations/i })).toBeInTheDocument();
    expect(screen.getByText(/come from modeled terminals and conductor ends/i)).toBeVisible();

    const points = screen.getByRole("table", { name: "Connection points" });
    expect(within(points).getByText("Always-hot splice")).toBeVisible();
    expect(within(points).getByText("Capped end")).toBeVisible();
    expect(within(points).getByText("Unconnected end")).toBeVisible();
    expect(within(points).getByText("Unknown end")).toBeVisible();
    expect(within(points).getByText("Ground / bond point")).toBeVisible();

    const conductorTable = screen.getByRole("table", { name: "Conductors and their ends" });
    expect(within(conductorTable).getByText("Pigtail")).toBeVisible();
    expect(within(conductorTable).getByText("Jumper")).toBeVisible();
    expect(within(conductorTable).getByText("Device lead")).toBeVisible();
    expect(within(conductorTable).getByText("black tape at both ends")).toBeVisible();
    expect(within(conductorTable).getAllByText("Optional / unknown")).toHaveLength(3);
    expect(within(conductorTable).getAllByText(/A: always-hot splice/i)).toHaveLength(2);
    expect(within(conductorTable).getByText(/B: capped spare/i)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("1 conductor end needs");
  });

  it("selects nodes, conductors, and individual ends with native keyboard controls", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<BoxTerminationView model={model} onSelect={onSelect} />);

    const spliceButton = screen.getByRole("button", { name: "Always-hot splice" });
    spliceButton.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith({ kind: "splice", id: "node-splice-line" });

    await user.click(screen.getByRole("button", { name: "COND-9003" }));
    expect(onSelect).toHaveBeenLastCalledWith({ kind: "conductor", id: "conductor-jumper" });

    await user.click(screen.getByRole("button", { name: "Select COND-9003 end B" }));
    expect(onSelect).toHaveBeenLastCalledWith({ kind: "conductor-end", id: "end-jumper-b" });
  });

  it("does not impose a display maximum on modeled conductors", () => {
    const manyConductors = Array.from({ length: 27 }, (_, index) => ({
      id: `bulk-${index}`,
      permanentCode: `COND-BULK-${String(index + 1).padStart(2, "0")}`,
      kind: "unknown" as const,
    }));
    render(<BoxTerminationView model={{ ...model, conductors: manyConductors, conductorEnds: [] }} />);

    const conductorTable = screen.getByRole("table", { name: "Conductors and their ends" });
    expect(within(conductorTable).getByText("COND-BULK-27")).toBeVisible();
    expect(within(conductorTable).getAllByRole("row")).toHaveLength(28);
  });
});

describe("BoxTerminationEditor", () => {
  it("edits conductor identity details while preserving optional gauge", () => {
    const onChange = vi.fn();
    render(<BoxTerminationEditor model={model} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("COND-9003 conductor kind"), { target: { value: "pigtail" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conductors: expect.arrayContaining([
          expect.objectContaining({ id: "conductor-jumper", kind: "pigtail" }),
        ]),
      }),
      { kind: "conductor", id: "conductor-jumper", field: "kind" },
    );

    fireEvent.change(screen.getByLabelText("COND-9003 gauge"), { target: { value: "14 AWG" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conductors: expect.arrayContaining([
          expect.objectContaining({ id: "conductor-jumper", gauge: "14 AWG" }),
        ]),
      }),
      { kind: "conductor", id: "conductor-jumper", field: "gauge" },
    );
  });

  it("edits terminals, endpoint status, and exact conductor-end destinations", () => {
    const onChange = vi.fn();
    render(<BoxTerminationEditor model={model} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Test smart switch — Line / hot terminal role"), { target: { value: "COMMON" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ terminals: expect.arrayContaining([expect.objectContaining({ id: "node-terminal-line", semanticRole: "COMMON" })]) }),
      { kind: "terminal", id: "node-terminal-line", field: "semanticRole" },
    );

    fireEvent.change(screen.getByLabelText("Open traveler endpoint status"), { target: { value: "capped" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ openEndpoints: expect.arrayContaining([expect.objectContaining({ id: "node-open", endpointKind: "capped" })]) }),
      { kind: "open-end", id: "node-open", field: "endpointKind" },
    );

    fireEvent.change(screen.getByLabelText("end-ground-b connection point"), { target: { value: "node-box-bond" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ conductorEnds: expect.arrayContaining([expect.objectContaining({ id: "end-ground-b", nodeId: "node-box-bond" })]) }),
      { kind: "conductor-end", id: "end-ground-b", field: "nodeId" },
    );
  });

  it("exposes add and remove requests without inventing records in the component", async () => {
    const user = userEvent.setup();
    const onRequestAdd = vi.fn();
    const onRequestRemove = vi.fn();
    render(
      <BoxTerminationEditor
        model={model}
        onChange={vi.fn()}
        onRequestAdd={onRequestAdd}
        onRequestRemove={onRequestRemove}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add conductor end/i }));
    expect(onRequestAdd).toHaveBeenCalledWith("conductor-end");

    await user.click(screen.getByRole("button", { name: "Remove COND-9002" }));
    expect(onRequestRemove).toHaveBeenCalledWith({ kind: "conductor", id: "conductor-pigtail" });
  });
});
