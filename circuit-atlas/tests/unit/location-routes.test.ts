// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createResource: vi.fn(),
  getRequestIdentity: vi.fn(),
  nextLocationCode: vi.fn(),
  updateResource: vi.fn(),
}));

vi.mock("@/db/repositories", () => ({
  createResource: mocks.createResource,
  nextLocationCode: mocks.nextLocationCode,
  updateResource: mocks.updateResource,
}));

vi.mock("@/lib/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/identity")>()),
  getRequestIdentity: mocks.getRequestIdentity,
}));

import * as collectionRoute from "@/app/api/p/[propertyId]/locations/[kind]/route";
import * as itemRoute from "@/app/api/p/[propertyId]/locations/[kind]/[id]/route";

const identity = {
  externalUserId: "owner-fixture",
  email: "owner@example.test",
  displayName: "Fixture Owner",
  isLocalDevelopment: false,
};

describe("location API identifiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestIdentity.mockResolvedValue(identity);
    mocks.nextLocationCode.mockResolvedValue("STR-0001");
    mocks.createResource.mockResolvedValue({ id: "structure-fixture", code: "STR-0001", name: "Fictional house" });
  });

  it("generates a structure code when the ordinary request omits it", async () => {
    const response = await collectionRoute.POST(
      new Request("https://atlas.example/api/p/property-fixture/locations/structures", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://atlas.example" },
        body: JSON.stringify({ name: "Fictional house", kind: "building" }),
      }),
      { params: Promise.resolve({ propertyId: "property-fixture", kind: "structures" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.nextLocationCode).toHaveBeenCalledWith(identity, "property-fixture", "structures");
    expect(mocks.createResource).toHaveBeenCalledWith(
      expect.objectContaining({ identity, propertyId: "property-fixture" }),
      "structures",
      expect.objectContaining({ code: "STR-0001", name: "Fictional house" }),
    );
  });

  it("rejects caller-supplied codes on create and update", async () => {
    const create = await collectionRoute.POST(
      new Request("https://atlas.example/api/p/property-fixture/locations/structures", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://atlas.example" },
        body: JSON.stringify({ name: "Fictional house", code: "USER-CODE" }),
      }),
      { params: Promise.resolve({ propertyId: "property-fixture", kind: "structures" }) },
    );
    expect(create.status).toBe(400);

    const update = await itemRoute.PATCH(
      new Request("https://atlas.example/api/p/property-fixture/locations/structures/structure-fixture", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "https://atlas.example" },
        body: JSON.stringify({ revision: 1, code: "RENAMED" }),
      }),
      { params: Promise.resolve({ propertyId: "property-fixture", kind: "structures", id: "structure-fixture" }) },
    );
    expect(update.status).toBe(400);
    expect(mocks.createResource).not.toHaveBeenCalled();
    expect(mocks.updateResource).not.toHaveBeenCalled();
  });
});
