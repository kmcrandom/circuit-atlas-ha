// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CaptureWizard,
  reviewCaptureDraft,
  type CaptureDraft,
} from "@/features/capture";

afterEach(cleanup);

const draft: CaptureDraft = {
  id: "draft-1",
  propertyId: "property-fictional",
  targetLabel: "Example gang box",
  locationLabel: "Example room",
  box: {
    displayName: "Example gang box",
    type: null,
    material: "unknown",
    gangCount: 2,
    orientation: "wall-finished-side",
  },
  photos: [],
  gangDevices: [],
  cables: [
    {
      id: "cable-1",
      wiringMethod: "nm-b",
      insulatedConductorCount: 3,
      equipmentGroundCount: 1,
      gauge: null,
      endDesignation: "a",
      entrySide: "top",
      entryOffset: 25,
      certainty: "observed",
    },
  ],
  conductors: [],
  notes: "",
  needsReview: false,
};

describe("capture wizard", () => {
  it("allows unknown optional gauge while flagging it for later review", () => {
    const issues = reviewCaptureDraft(draft);
    expect(issues.some((issue) => issue.id === "cable-1-gauge")).toBe(true);
    expect(issues.find((issue) => issue.id === "cable-1-gauge")?.severity).toBe("info");
  });

  it("shows safety copy and finishes an incomplete draft with review flags", () => {
    const onComplete = vi.fn();
    render(
      <CaptureWizard
        draft={draft}
        step="review"
        saveState="saved"
        onDraftChange={vi.fn()}
        onStepChange={vi.fn()}
        onSaveDraft={vi.fn()}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByText(/independently verify before opening or inspecting a box/i)).toBeTruthy();
    expect(screen.getByText(/incomplete work is valid/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Finish with review flags/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].needsReview).toBe(true);
  });

  it("captures A and B terminations independently for every conductor", () => {
    const onDraftChange = vi.fn();
    const conductorDraft: CaptureDraft = {
      ...draft,
      conductors: [
        {
          id: "conductor-1",
          permanentCode: "COND-TEST-1",
          cableId: "cable-1",
          kind: "pigtail",
          observedColor: "black",
          ends: [
            {
              id: "conductor-1-end-a",
              designation: "a",
              terminationType: "splice",
              terminationLabel: "Always-hot splice",
              certainty: "observed",
            },
            {
              id: "conductor-1-end-b",
              designation: "b",
              terminationType: "unknown",
              certainty: "unknown",
            },
          ],
        },
      ],
    };

    render(
      <CaptureWizard
        draft={conductorDraft}
        step="conductors"
        onDraftChange={onDraftChange}
        onSaveDraft={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "End A" })).toBeVisible();
    expect(screen.getByRole("group", { name: "End B" })).toBeVisible();
    expect(screen.getByLabelText("End A terminal / splice label")).toHaveValue("Always-hot splice");

    fireEvent.change(screen.getByLabelText("End B termination"), {
      target: { value: "terminal" },
    });
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conductors: [
          expect.objectContaining({
            ends: [
              expect.objectContaining({ id: "conductor-1-end-a", terminationType: "splice" }),
              expect.objectContaining({ id: "conductor-1-end-b", terminationType: "terminal" }),
            ],
          }),
        ],
      }),
    );

    expect(reviewCaptureDraft(conductorDraft)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "conductor-1-b-termination" }),
      ]),
    );
    expect(reviewCaptureDraft(conductorDraft)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "conductor-1-a-termination" }),
      ]),
    );
  });

  it("creates both end records when adding a conductor", () => {
    const onDraftChange = vi.fn();
    render(
      <CaptureWizard
        draft={draft}
        step="conductors"
        onDraftChange={onDraftChange}
        onSaveDraft={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add conductor/i }));
    const addedConductor = onDraftChange.mock.calls[0][0].conductors[0];
    expect(addedConductor.ends).toEqual([
      expect.objectContaining({ designation: "a", terminationType: "unknown" }),
      expect.objectContaining({ designation: "b", terminationType: "unknown" }),
    ]);
  });
});
