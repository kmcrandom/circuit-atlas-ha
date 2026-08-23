// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archivePrivateFile: vi.fn(),
  createPrivateFile: vi.fn(),
  getRequestIdentity: vi.fn(),
  listPrivateFiles: vi.fn(),
  readPrivateFile: vi.fn(),
}));

vi.mock("@/db/repositories/files", () => ({
  PRIVATE_FILE_OWNER_TYPES: [
    "property",
    "asset",
    "evidence",
    "assertion",
    "floor_plan",
    "capture_draft",
    "upgrade_item",
  ],
  archivePrivateFile: mocks.archivePrivateFile,
  createPrivateFile: mocks.createPrivateFile,
  listPrivateFiles: mocks.listPrivateFiles,
  readPrivateFile: mocks.readPrivateFile,
}));

vi.mock("@/lib/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/identity")>()),
  getRequestIdentity: mocks.getRequestIdentity,
}));

import * as collectionRoute from "@/app/api/p/[propertyId]/files/route";
import * as itemRoute from "@/app/api/p/[propertyId]/files/[fileId]/route";

const identity = {
  externalUserId: "owner-1",
  email: "owner@example.test",
  displayName: "Owner",
  isLocalDevelopment: false,
};

function activeFile(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-1",
    propertyId: "property-1",
    ownerType: "property",
    ownerId: "property-1",
    originalFileName: "Floor plan ü.png",
    mimeType: "image/png",
    byteSize: 12,
    sha256: null,
    widthPixels: null,
    heightPixels: null,
    pageCount: null,
    altText: "First floor",
    lifecycleState: "active",
    revision: 1,
    createdAt: "2026-08-13 12:00:00",
    updatedAt: "2026-08-13 12:00:00",
    ...overrides,
  };
}

const collectionContext = {
  params: Promise.resolve({ propertyId: "property-1" }),
};
const itemContext = {
  params: Promise.resolve({ propertyId: "property-1", fileId: "file-1" }),
};

describe("private-file API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestIdentity.mockResolvedValue(identity);
  });

  it("lists private metadata with authenticated content paths and no object keys", async () => {
    mocks.listPrivateFiles.mockResolvedValue([activeFile()]);

    const response = await collectionRoute.GET(
      new Request(
        "https://atlas.example/api/p/property-1/files?ownerType=property&ownerId=property-1",
      ),
      collectionContext,
    );
    const body = (await response.json()) as {
      items: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(mocks.listPrivateFiles).toHaveBeenCalledWith(identity, "property-1", {
      ownerType: "property",
      ownerId: "property-1",
      includeArchived: false,
    });
    expect(body.items[0].contentPath).toBe(
      "/api/p/property-1/files/file-1",
    );
    expect(body.items[0].downloadUrl).toBe(body.items[0].contentPath);
    expect(body.items[0]).not.toHaveProperty("objectKey");
  });

  it("accepts a same-origin multipart upload and forwards bounded metadata", async () => {
    mocks.createPrivateFile.mockResolvedValue(activeFile());
    const boundary = "circuit-atlas-test-boundary";
    const multipart = [
      `--${boundary}\r\nContent-Disposition: form-data; name="ownerType"\r\n\r\nproperty\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="ownerId"\r\n\r\nproperty-1\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nfloor-plan\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="altText"\r\n\r\nFirst floor\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="floor-plan.png"\r\nContent-Type: image/png\r\n\r\nPNG-CONTENTS\r\n`,
      `--${boundary}--\r\n`,
    ].join("");

    const request = new Request("https://atlas.example/api/p/property-1/files", {
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          origin: "https://atlas.example",
        },
        body: multipart,
      });
    const response = await collectionRoute.POST(
      request,
      collectionContext,
    );

    expect(response.status).toBe(201);
    expect(mocks.createPrivateFile).toHaveBeenCalledWith(
      expect.objectContaining({ identity, propertyId: "property-1" }),
      expect.objectContaining({
        ownerType: "property",
        ownerId: "property-1",
        category: "floor-plan",
        originalFileName: "floor-plan.png",
        declaredMimeType: "image/png",
        altText: "First floor",
        bytes: expect.any(ArrayBuffer),
      }),
    );
  });

  it("rejects a cross-origin upload before storing anything", async () => {
    const response = await collectionRoute.POST(
      new Request("https://atlas.example/api/p/property-1/files", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=unused",
          origin: "https://attacker.example",
        },
      }),
      collectionContext,
    );

    expect(response.status).toBe(400);
    expect(mocks.createPrivateFile).not.toHaveBeenCalled();
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
  });

  it("streams a private file with hardened headers and optional download", async () => {
    const bytes = new TextEncoder().encode("private bytes");
    mocks.readPrivateFile.mockResolvedValue({
      info: activeFile({ byteSize: bytes.byteLength }),
      body: new Response(bytes).body,
      size: bytes.byteLength,
    });

    const response = await itemRoute.GET(
      new Request(
        "https://atlas.example/api/p/property-1/files/file-1?download=1",
      ),
      itemContext,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("private bytes");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename=/,
    );
    expect(response.headers.get("content-disposition")).toContain("filename*=");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.readPrivateFile).toHaveBeenCalledWith(
      identity,
      "property-1",
      "file-1",
    );
  });

  it("archives with optimistic revision and a same-origin check", async () => {
    mocks.archivePrivateFile.mockResolvedValue(
      activeFile({ lifecycleState: "archived", revision: 2 }),
    );

    const response = await itemRoute.DELETE(
      new Request("https://atlas.example/api/p/property-1/files/file-1", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          origin: "https://atlas.example",
          "x-request-id": "archive-file-1",
        },
        body: JSON.stringify({ revision: 1 }),
      }),
      itemContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.archivePrivateFile).toHaveBeenCalledWith(
      {
        identity,
        propertyId: "property-1",
        requestId: "archive-file-1",
      },
      "file-1",
      1,
    );
    const body = (await response.json()) as {
      file: { lifecycleState: string };
    };
    expect(body.file.lifecycleState).toBe("archived");
  });
});
