// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyOwnedPropertyImport: vi.fn(),
  getRequestIdentity: vi.fn(),
  previewOwnedPropertyImport: vi.fn(),
  serializePropertyExport: vi.fn(),
}));

vi.mock("@/db/repositories/portability", () => ({
  applyOwnedPropertyImport: mocks.applyOwnedPropertyImport,
  previewOwnedPropertyImport: mocks.previewOwnedPropertyImport,
  serializePropertyExport: mocks.serializePropertyExport,
}));
vi.mock("@/lib/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/identity")>()),
  getRequestIdentity: mocks.getRequestIdentity,
}));

import * as exportRoute from "@/app/api/p/[propertyId]/export/route";
import * as importRoute from "@/app/api/p/[propertyId]/import/route";

const identity = {
  externalUserId: "owner-fixture",
  email: "owner@example.test",
  displayName: "Fixture Owner",
  isLocalDevelopment: false,
};
const context = {
  params: Promise.resolve({ propertyId: "property-fixture" }),
};
const manifest = {
  format: "circuit-atlas/property",
  schemaVersion: 1,
};

describe("property portability routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestIdentity.mockResolvedValue(identity);
  });

  it("downloads a private, self-contained versioned property export", async () => {
    mocks.serializePropertyExport.mockResolvedValue('{"schemaVersion":1}');
    const response = await exportRoute.GET(
      new Request(
        "https://atlas.example/api/p/property-fixture/export?includeFiles=true",
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment;/,
    );
    expect(mocks.serializePropertyExport).toHaveBeenCalledWith(
      identity,
      "property-fixture",
      { includeFiles: true },
    );
  });

  it("previews before applying and scopes both operations to the owned anchor", async () => {
    mocks.previewOwnedPropertyImport.mockResolvedValue({
      canApply: true,
      confirmationToken: "a".repeat(64),
    });
    const previewResponse = await importRoute.POST(
      new Request("https://atlas.example/api/p/property-fixture/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://atlas.example",
        },
        body: JSON.stringify({ mode: "merge", manifest }),
      }),
      context,
    );
    expect(previewResponse.status).toBe(200);
    expect(mocks.previewOwnedPropertyImport).toHaveBeenCalledWith(
      identity,
      "property-fixture",
      manifest,
      "merge",
    );
    expect(mocks.applyOwnedPropertyImport).not.toHaveBeenCalled();

    mocks.applyOwnedPropertyImport.mockResolvedValue({
      mode: "merge",
      propertyId: "property-fixture",
      summary: { create: 0, update: 1, unchanged: 1, conflict: 0 },
    });
    const confirmationToken = "a".repeat(64);
    const applyResponse = await importRoute.POST(
      new Request("https://atlas.example/api/p/property-fixture/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://atlas.example",
        },
        body: JSON.stringify({ mode: "merge", manifest, confirmationToken }),
      }),
      context,
    );
    expect(applyResponse.status).toBe(200);
    expect(mocks.applyOwnedPropertyImport).toHaveBeenCalledWith(
      identity,
      "property-fixture",
      manifest,
      "merge",
      confirmationToken,
    );
  });

  it("rejects a cross-origin import before authentication or persistence", async () => {
    const response = await importRoute.POST(
      new Request("https://atlas.example/api/p/property-fixture/import", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
    expect(mocks.previewOwnedPropertyImport).not.toHaveBeenCalled();
    expect(mocks.applyOwnedPropertyImport).not.toHaveBeenCalled();
  });

  it("validates export options instead of silently dropping file content", async () => {
    const response = await exportRoute.GET(
      new Request(
        "https://atlas.example/api/p/property-fixture/export?includeFiles=maybe",
      ),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.serializePropertyExport).not.toHaveBeenCalled();
  });
});
