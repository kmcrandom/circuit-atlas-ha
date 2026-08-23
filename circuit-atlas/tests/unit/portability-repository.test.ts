// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { sealPropertyManifest, type UnsealedPropertyManifestV1 } from "@/lib/import-export";

const mocks = vi.hoisted(() => ({
  batch: vi.fn(),
  prepared: [] as Array<{ query: string; values: unknown[] }>,
  requireOwnedProperty: vi.fn(),
}));

function fakeDatabase() {
  return {
    prepare(query: string) {
      const statement = {
        query,
        values: [] as unknown[],
        bind(...values: unknown[]) {
          statement.values = values;
          mocks.prepared.push(statement);
          return statement;
        },
        async all() {
          if (query.startsWith("SELECT * FROM properties WHERE id")) {
            return { success: true, results: [] };
          }
          if (query.includes("AS next_value FROM properties")) {
            return { success: true, results: [{ next_value: 7 }] };
          }
          return { success: true, results: [] };
        },
      };
      return statement;
    },
    batch: mocks.batch,
  };
}

vi.mock("@/db", () => ({ getSqliteConnection: () => fakeDatabase() }));
vi.mock("@/db/repositories/workspaces", () => ({
  requireOwnedProperty: mocks.requireOwnedProperty,
}));

import {
  applyOwnedPropertyImport,
  buildPropertyExport,
  previewOwnedPropertyImport,
} from "@/db/repositories/portability";

const identity = {
  provider: "cloudflare-access" as const,
  subject: "owner-fixture",
  externalUserId: "owner-fixture",
  email: "owner@example.test",
  displayName: "Fixture Owner",
  isLocalDevelopment: false,
};

function unsealed(propertyId = "property-imported"): UnsealedPropertyManifestV1 {
  return {
    format: "circuit-atlas/property",
    schemaVersion: 1,
    exportId: "export-fixture",
    exportedAt: "2026-08-13T12:00:00.000Z",
    generator: { name: "Circuit Atlas", version: "0.1.0-test" },
    property: {
      id: propertyId,
      revision: 1,
      data: {
        name: "Fictional imported property",
        address: null,
        preferencesJson: "{}",
        namingConfigJson: "{}",
        lifecycleState: "active",
      },
    },
    records: [],
    relationships: [],
    attachments: [],
    checksums: { algorithm: "SHA-256", attachments: [] },
  };
}

describe("property-isolated portability repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepared.length = 0;
    mocks.requireOwnedProperty.mockResolvedValue({
      id: "anchor-property",
      workspaceId: "workspace-owner",
      permanentCode: "PROP-0001",
      name: "Fictional anchor property",
      address: null,
      preferencesJson: "{}",
      namingConfigJson: "{}",
      lifecycleState: "active",
      revision: 1,
      createdAt: "2026-08-13 12:00:00",
      updatedAt: "2026-08-13 12:00:00",
    });
    mocks.batch.mockImplementation(async (statements: unknown[]) =>
      statements.map(() => ({ success: true })),
    );
  });

  it("exports only the owned property scope and excludes workspace/storage internals", async () => {
    const manifest = await buildPropertyExport(
      identity,
      "anchor-property",
      { includeFiles: false },
    );
    expect(mocks.requireOwnedProperty).toHaveBeenCalledWith(
      identity,
      "anchor-property",
    );
    const propertyQueries = mocks.prepared.filter((statement) =>
      statement.query.includes("WHERE property_id = ?"),
    );
    expect(propertyQueries.length).toBeGreaterThan(40);
    expect(
      propertyQueries.every(
        (statement) => statement.values[0] === "anchor-property",
      ),
    ).toBe(true);
    expect(manifest.property.data).not.toHaveProperty("workspaceId");
    expect(JSON.stringify(manifest)).not.toContain("object_key");
  });

  it("blocks a merge whose manifest names a different property", async () => {
    const manifest = await sealPropertyManifest(unsealed("other-property"));
    const preview = await previewOwnedPropertyImport(
      identity,
      "anchor-property",
      manifest,
      "merge",
    );

    expect(mocks.requireOwnedProperty).toHaveBeenCalledWith(
      identity,
      "anchor-property",
    );
    expect(preview.canApply).toBe(false);
    expect(preview.outcomes.every((outcome) => outcome.action === "conflict")).toBe(
      true,
    );
    expect(preview.confirmationToken).toBeNull();
  });

  it("requires a preview token and creates an added property only in the anchor workspace", async () => {
    const manifest = await sealPropertyManifest(unsealed());
    const preview = await previewOwnedPropertyImport(
      identity,
      "anchor-property",
      manifest,
      "add",
    );
    expect(preview.canApply).toBe(true);
    expect(preview.confirmationToken).toMatch(/^[a-f0-9]{64}$/);

    const result = await applyOwnedPropertyImport(
      identity,
      "anchor-property",
      manifest,
      "add",
      preview.confirmationToken!,
    );
    expect(result.propertyId).toBe("property-imported");
    expect(mocks.batch).toHaveBeenCalledTimes(1);
    const propertyInsert = mocks.prepared.find((statement) =>
      statement.query.startsWith("INSERT INTO properties"),
    );
    expect(propertyInsert?.values.slice(0, 3)).toEqual([
      "property-imported",
      "workspace-owner",
      "PROP-0007",
    ]);
  });

  it("rejects a stale or invented confirmation token before batching", async () => {
    const manifest = await sealPropertyManifest(unsealed());
    await expect(
      applyOwnedPropertyImport(
        identity,
        "anchor-property",
        manifest,
        "add",
        "0".repeat(64),
      ),
    ).rejects.toThrow("confirmation");
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("keeps metadata-only attachments in preview and refuses a partial apply", async () => {
    const draft = unsealed();
    draft.attachments.push({
      id: "attachment-fixture",
      propertyId: draft.property.id,
      revision: 1,
      owner: { kind: "property", id: draft.property.id },
      purpose: "property",
      originalName: "fictional-plan.png",
      mediaType: "image/png",
      byteLength: 8,
      data: {},
    });
    draft.checksums.attachments.push({
      attachmentId: "attachment-fixture",
      sha256: "a".repeat(64),
    });
    const manifest = await sealPropertyManifest(draft);
    const preview = await previewOwnedPropertyImport(
      identity,
      "anchor-property",
      manifest,
      "add",
    );

    expect(preview.canApply).toBe(false);
    expect(preview.confirmationToken).toBeNull();
    expect(preview.constraints).toContainEqual(
      expect.objectContaining({ code: "attachment_content_missing" }),
    );
  });
});
