// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveFloorPlan: vi.fn(),
  createFloorPlan: vi.fn(),
  getFloorPlan: vi.fn(),
  getRequestIdentity: vi.fn(),
  listFloorPlans: vi.fn(),
  updateFloorPlan: vi.fn(),
}));

vi.mock("@/db/repositories/floor-plans", () => ({
  archiveFloorPlan: mocks.archiveFloorPlan,
  createFloorPlan: mocks.createFloorPlan,
  getFloorPlan: mocks.getFloorPlan,
  listFloorPlans: mocks.listFloorPlans,
  updateFloorPlan: mocks.updateFloorPlan,
}));

vi.mock("@/lib/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/identity")>()),
  getRequestIdentity: mocks.getRequestIdentity,
}));

import * as collectionRoute from "@/app/api/p/[propertyId]/floor-plans/route";
import * as itemRoute from "@/app/api/p/[propertyId]/floor-plans/[floorPlanId]/route";

const identity = {
  externalUserId: "owner-fixture",
  email: "owner@example.test",
  displayName: "Fixture Owner",
  isLocalDevelopment: false,
};
const plan = {
  id: "plan-fixture",
  propertyId: "property-fixture",
  levelId: "level-fixture",
  name: "Fixture floor plan",
  pageNumber: 1,
  unitsPerPlanUnit: null,
  calibrationUnit: null,
  orientationDegrees: 0,
  lifecycleState: "active",
  revision: 1,
  createdAt: "2026-08-13 12:00:00",
  updatedAt: "2026-08-13 12:00:00",
  backgroundAttachment: {
    id: "file-fixture",
    originalFileName: "fixture.png",
    mimeType: "image/png",
    byteSize: 42,
    widthPixels: 1200,
    heightPixels: 900,
    pageCount: null,
    altText: "Fictional plan",
    revision: 1,
    contentPath: "/api/p/property-fixture/files/file-fixture",
    downloadUrl: "/api/p/property-fixture/files/file-fixture",
  },
};
const collectionContext = {
  params: Promise.resolve({ propertyId: "property-fixture" }),
};
const itemContext = {
  params: Promise.resolve({
    propertyId: "property-fixture",
    floorPlanId: "plan-fixture",
  }),
};

describe("floor-plan API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestIdentity.mockResolvedValue(identity);
  });

  it("returns private background metadata without exposing storage keys", async () => {
    mocks.listFloorPlans.mockResolvedValue([plan]);
    const response = await collectionRoute.GET(
      new Request("https://atlas.example/api/p/property-fixture/floor-plans"),
      collectionContext,
    );
    const body = (await response.json()) as { items: typeof plan[] };

    expect(response.status).toBe(200);
    expect(mocks.listFloorPlans).toHaveBeenCalledWith(
      identity,
      "property-fixture",
    );
    expect(body.items[0].backgroundAttachment.downloadUrl).toBe(
      "/api/p/property-fixture/files/file-fixture",
    );
    expect(body.items[0].backgroundAttachment).not.toHaveProperty("objectKey");
  });

  it("creates metadata after enforcing the same-origin write boundary", async () => {
    mocks.createFloorPlan.mockResolvedValue(plan);
    const response = await collectionRoute.POST(
      new Request("https://atlas.example/api/p/property-fixture/floor-plans", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://atlas.example",
        },
        body: JSON.stringify({
          levelId: "level-fixture",
          name: "Fixture floor plan",
        }),
      }),
      collectionContext,
    );

    expect(response.status).toBe(201);
    expect(mocks.createFloorPlan).toHaveBeenCalledWith(
      identity,
      "property-fixture",
      { levelId: "level-fixture", name: "Fixture floor plan" },
    );
  });

  it("requires an optimistic revision when editing or archiving", async () => {
    mocks.updateFloorPlan.mockResolvedValue({ ...plan, revision: 2 });
    const patch = await itemRoute.PATCH(
      new Request(
        "https://atlas.example/api/p/property-fixture/floor-plans/plan-fixture",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin: "https://atlas.example",
          },
          body: JSON.stringify({ revision: 1, name: "Renamed plan" }),
        },
      ),
      itemContext,
    );
    expect(patch.status).toBe(200);
    expect(mocks.updateFloorPlan).toHaveBeenCalledWith(
      identity,
      "property-fixture",
      "plan-fixture",
      { revision: 1, name: "Renamed plan" },
    );

    mocks.archiveFloorPlan.mockResolvedValue({
      ...plan,
      revision: 2,
      lifecycleState: "archived",
    });
    const archive = await itemRoute.DELETE(
      new Request(
        "https://atlas.example/api/p/property-fixture/floor-plans/plan-fixture",
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            origin: "https://atlas.example",
          },
          body: JSON.stringify({ revision: 1 }),
        },
      ),
      itemContext,
    );
    expect(archive.status).toBe(200);
    expect(mocks.archiveFloorPlan).toHaveBeenCalledWith(
      identity,
      "property-fixture",
      "plan-fixture",
      1,
    );
  });

  it("rejects cross-origin writes before repository calls", async () => {
    const response = await collectionRoute.POST(
      new Request("https://atlas.example/api/p/property-fixture/floor-plans", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
      collectionContext,
    );
    expect(response.status).toBe(400);
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
    expect(mocks.createFloorPlan).not.toHaveBeenCalled();
  });
});
