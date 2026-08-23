// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SettingsClient,
  buildLocationHierarchy,
  validateFloorPlanBackground,
} from "@/app/p/[propertyId]/settings/settings-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("property settings", () => {
  it("groups plans and spaces under their real structure and level records", () => {
    const hierarchy = buildLocationHierarchy(
      {
        structures: [
          {
            id: "structure-z",
            code: "Z",
            name: "Fictional Structure Z",
            kind: "building",
            sortOrder: 2,
            revision: 1,
          },
          {
            id: "structure-a",
            code: "A",
            name: "Fictional Structure A",
            kind: "building",
            sortOrder: 1,
            revision: 1,
          },
        ],
        levels: [
          {
            id: "level-a",
            structureId: "structure-a",
            code: "L1",
            name: "Example Level",
            elevationOrder: 1,
            revision: 1,
          },
        ],
        spaces: [
          {
            id: "space-a",
            levelId: "level-a",
            code: "ROOM",
            name: "Example Room",
            kind: "room",
            sortOrder: 0,
            revision: 1,
          },
        ],
        wallZones: [],
      },
      [
        {
          id: "plan-a",
          propertyId: "property-fixture",
          levelId: "level-a",
          name: "Example Plan",
          orientationDegrees: 0,
          revision: 1,
          backgroundAttachment: null,
        },
      ],
    );

    expect(hierarchy.map((node) => node.structure.id)).toEqual([
      "structure-a",
      "structure-z",
    ]);
    expect(hierarchy[0].levels[0].spaces[0].id).toBe("space-a");
    expect(hierarchy[0].levels[0].floorPlans[0].id).toBe("plan-a");
  });

  it("accepts a supported background with a browser-missing MIME type and rejects oversized files", () => {
    expect(
      validateFloorPlanBackground({
        name: "example.pdf",
        type: "",
        size: 1_024,
      } as File),
    ).toBeNull();
    expect(
      validateFloorPlanBackground({
        name: "example.png",
        type: "image/png",
        size: 25 * 1024 * 1024 + 1,
      } as File),
    ).toMatch(/25 MB or smaller/);
  });

  it("loads an empty property from the location and floor-plan APIs without seeded house data", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/api/properties/property-fixture")) {
        return new Response(
          JSON.stringify({
            property: {
              id: "property-fixture",
              permanentCode: "PROP-TEST",
              name: "Fictional empty property",
              address: null,
              revision: 1,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (path.endsWith("/locations")) {
        return new Response(
          JSON.stringify({ structures: [], levels: [], spaces: [], wallZones: [] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (path.endsWith("/floor-plans")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: { message: "Not found" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsClient propertyId="property-fixture" />);

    expect(
      await screen.findByRole("heading", {
        name: "Locations, levels, and floor plans",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("No locations recorded")).toBeInTheDocument();
    expect(screen.getByText("No floor plans recorded")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add a wall or zone" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/structure code/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/level code/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/space code/i)).not.toBeInTheDocument();
    expect(screen.queryByText("PROP-TEST")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/p/property-fixture/locations",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/properties/property-fixture",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/p/property-fixture/floor-plans",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
