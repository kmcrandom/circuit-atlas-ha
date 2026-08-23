import { describe, expect, it } from "vitest";

import {
  calculateAttachmentChecksum,
  previewPropertyImport,
  sealPropertyManifest,
  serializePropertyManifest,
  validateManifestRelationships,
  validatePropertyManifest,
  verifyAttachmentChecksum,
  verifyManifestChecksum,
  type PropertyManifestV1,
  type UnsealedPropertyManifestV1,
} from "../../lib/import-export";

const FIXED_ATTACHMENT_DIGEST = "a".repeat(64);

function unsealedManifest(
  overrides: Partial<UnsealedPropertyManifestV1> = {},
): UnsealedPropertyManifestV1 {
  return {
    format: "circuit-atlas/property",
    schemaVersion: 1,
    exportId: "export-fixture-001",
    exportedAt: "2026-08-13T12:00:00.000Z",
    generator: { name: "Circuit Atlas", version: "0.1.0-test" },
    property: {
      id: "property-fixture-alpha",
      revision: 1,
      data: { displayName: "Fictional Property Alpha" },
    },
    records: [
      {
        id: "record-panel-001",
        propertyId: "property-fixture-alpha",
        kind: "panel",
        revision: 1,
        data: { displayName: "Fixture Panel" },
      },
      {
        id: "record-device-001",
        propertyId: "property-fixture-alpha",
        kind: "device",
        revision: 1,
        data: { displayName: "Fixture Device" },
      },
    ],
    relationships: [
      {
        id: "relationship-supply-001",
        propertyId: "property-fixture-alpha",
        kind: "supplies",
        revision: 1,
        from: { recordId: "record-panel-001", role: "source" },
        to: { recordId: "record-device-001", role: "load" },
        data: {},
      },
    ],
    attachments: [
      {
        id: "attachment-fixture-001",
        propertyId: "property-fixture-alpha",
        revision: 1,
        owner: { kind: "record", id: "record-panel-001" },
        purpose: "evidence-photo",
        originalName: "fixture-panel.jpg",
        mediaType: "image/jpeg",
        byteLength: 42,
        archivePath: "attachments/attachment-fixture-001",
        data: { description: "Fictional test image" },
      },
    ],
    checksums: {
      algorithm: "SHA-256",
      attachments: [
        {
          attachmentId: "attachment-fixture-001",
          sha256: FIXED_ATTACHMENT_DIGEST,
        },
      ],
    },
    ...overrides,
  };
}

describe("property manifest validation", () => {
  it("accepts a sealed, internally consistent version 1 manifest", async () => {
    const manifest = await sealPropertyManifest(unsealedManifest());

    expect(await verifyManifestChecksum(manifest)).toBe(true);
    await expect(validatePropertyManifest(manifest)).resolves.toMatchObject({
      valid: true,
      manifest,
      issues: [],
    });
  });

  it("rejects unsupported versions and unknown document fields", async () => {
    const manifest = await sealPropertyManifest(unsealedManifest());
    const result = await validatePropertyManifest({
      ...manifest,
      schemaVersion: 2,
      unexpected: true,
    });

    expect(result.valid).toBe(false);
    expect(result.manifest).toBeNull();
    expect(result.issues.every((issue) => issue.code === "schema_error")).toBe(
      true,
    );
  });

  it("reports cross-property ownership, dangling endpoints, and attachment owners", async () => {
    const draft = unsealedManifest();
    draft.records[0] = {
      ...draft.records[0],
      propertyId: "property-fixture-beta",
    };
    draft.relationships[0] = {
      ...draft.relationships[0],
      to: { recordId: "record-missing", role: "load" },
    };
    draft.attachments[0] = {
      ...draft.attachments[0],
      owner: { kind: "record", id: "record-missing" },
    };
    const manifest = await sealPropertyManifest(draft);
    const result = await validatePropertyManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "property_boundary",
        "dangling_reference",
        "dangling_reference",
      ]),
    );
  });

  it("requires exactly one checksum per attachment", async () => {
    const missingDraft = unsealedManifest();
    missingDraft.checksums.attachments = [];
    const missing = await sealPropertyManifest(missingDraft);

    expect(validateManifestRelationships(missing)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_attachment_checksum" }),
      ]),
    );

    const duplicateDraft = unsealedManifest();
    duplicateDraft.checksums.attachments.push(
      duplicateDraft.checksums.attachments[0],
    );
    const duplicate = await sealPropertyManifest(duplicateDraft);
    expect(validateManifestRelationships(duplicate)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_attachment_checksum" }),
      ]),
    );
  });

  it("detects content changes made after an export is sealed", async () => {
    const manifest = await sealPropertyManifest(unsealedManifest());
    const tampered: PropertyManifestV1 = {
      ...manifest,
      records: manifest.records.map((record, index) =>
        index === 0
          ? { ...record, data: { displayName: "Changed after export" } }
          : record,
      ),
    };

    expect(await verifyManifestChecksum(tampered)).toBe(false);
    const result = await validatePropertyManifest(tampered);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "manifest_checksum_mismatch" }),
    );
  });
});

describe("deterministic property serialization", () => {
  it("normalizes entity and checksum ordering before sealing", async () => {
    const forward = unsealedManifest();
    const reverse = unsealedManifest({
      records: [...forward.records].reverse(),
      relationships: [...forward.relationships].reverse(),
      attachments: [...forward.attachments].reverse(),
      checksums: {
        ...forward.checksums,
        attachments: [...forward.checksums.attachments].reverse(),
      },
    });

    const first = await sealPropertyManifest(forward);
    const second = await sealPropertyManifest(reverse);

    expect(first.checksums.manifestSha256).toBe(
      second.checksums.manifestSha256,
    );
    expect(serializePropertyManifest(first)).toBe(
      serializePropertyManifest(second),
    );
  });

  it("computes and verifies attachment content checksums", async () => {
    const bytes = new TextEncoder().encode("fixture attachment contents");
    const checksum = await calculateAttachmentChecksum(bytes);

    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    await expect(verifyAttachmentChecksum(bytes, checksum)).resolves.toBe(true);
    await expect(
      verifyAttachmentChecksum(new TextEncoder().encode("changed"), checksum),
    ).resolves.toBe(false);
  });
});

describe("import preview", () => {
  it("previews an independent property import as additive", async () => {
    const incoming = await sealPropertyManifest(unsealedManifest());
    const preview = await previewPropertyImport({ incoming, mode: "add" });

    expect(preview.canApply).toBe(true);
    expect(preview.summary).toEqual({
      create: 5,
      update: 0,
      unchanged: 0,
      conflict: 0,
      preservedExisting: 0,
    });
  });

  it("classifies merge creates, updates, unchanged rows, conflicts, and preserved rows", async () => {
    const baseDraft = unsealedManifest();
    baseDraft.records.push(
      {
        id: "record-update-001",
        propertyId: baseDraft.property.id,
        kind: "device",
        revision: 1,
        data: { state: "old" },
      },
      {
        id: "record-conflict-001",
        propertyId: baseDraft.property.id,
        kind: "device",
        revision: 2,
        data: { state: "local" },
      },
      {
        id: "record-preserved-001",
        propertyId: baseDraft.property.id,
        kind: "device",
        revision: 1,
        data: { state: "local-only" },
      },
    );
    const target = await sealPropertyManifest(baseDraft);

    const incomingDraft = unsealedManifest();
    incomingDraft.records.push(
      {
        id: "record-update-001",
        propertyId: incomingDraft.property.id,
        kind: "device",
        revision: 2,
        data: { state: "imported-newer" },
      },
      {
        id: "record-conflict-001",
        propertyId: incomingDraft.property.id,
        kind: "device",
        revision: 1,
        data: { state: "imported-stale" },
      },
      {
        id: "record-create-001",
        propertyId: incomingDraft.property.id,
        kind: "device",
        revision: 1,
        data: { state: "new" },
      },
    );
    const incoming = await sealPropertyManifest(incomingDraft);
    const preview = await previewPropertyImport({
      incoming,
      mode: "merge",
      target,
    });

    expect(preview.canApply).toBe(false);
    expect(preview.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "record-device-001", action: "unchanged" }),
        expect.objectContaining({ id: "record-update-001", action: "update" }),
        expect.objectContaining({ id: "record-conflict-001", action: "conflict" }),
        expect.objectContaining({ id: "record-create-001", action: "create" }),
      ]),
    );
    expect(preview.summary).toMatchObject({
      create: 1,
      update: 1,
      conflict: 1,
      preservedExisting: 1,
    });
  });

  it("blocks a merge across property boundaries", async () => {
    const incoming = await sealPropertyManifest(unsealedManifest());
    const targetDraft = unsealedManifest({
      property: {
        id: "property-fixture-beta",
        revision: 1,
        data: { displayName: "Fictional Property Beta" },
      },
      records: [],
      relationships: [],
      attachments: [],
      checksums: { algorithm: "SHA-256", attachments: [] },
    });
    const target = await sealPropertyManifest(targetDraft);
    const preview = await previewPropertyImport({
      incoming,
      mode: "merge",
      target,
    });

    expect(preview.canApply).toBe(false);
    expect(preview.outcomes.every((outcome) => outcome.action === "conflict")).toBe(
      true,
    );
    expect(preview.outcomes[0]?.reason).toBe("property_mismatch");
  });
});
