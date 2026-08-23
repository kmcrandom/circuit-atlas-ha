import { describe, expect, it } from "vitest";

import {
  createPrivatePropertyFileKey,
  detectPrivateFileMimeType,
  getPrivatePropertyFilePrefix,
  isPrivateFileKeyScopedToProperty,
  sanitizePrivateFileName,
  sha256Hex,
  validatePrivateFile,
} from "../../lib/files";

const PDF_HEADER = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37,
]);
const PNG_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const WEBP_HEADER = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe("private file validation", () => {
  it("detects the allowed file signatures", () => {
    expect(detectPrivateFileMimeType(PDF_HEADER)).toBe("application/pdf");
    expect(detectPrivateFileMimeType(PNG_HEADER)).toBe("image/png");
    expect(detectPrivateFileMimeType(JPEG_HEADER)).toBe("image/jpeg");
    expect(detectPrivateFileMimeType(WEBP_HEADER)).toBe("image/webp");
  });

  it("accepts a valid file from metadata and a header sample", () => {
    expect(
      validatePrivateFile({
        fileName: "floor-plan.pdf",
        mimeType: "application/pdf; charset=binary",
        sizeBytes: 2_048,
        header: PDF_HEADER,
      }),
    ).toEqual({
      valid: true,
      sanitizedName: "floor-plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2_048,
      issues: [],
    });
  });

  it("rejects MIME spoofing, oversized content, and misleading extensions", () => {
    const result = validatePrivateFile(
      {
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 501,
        header: JPEG_HEADER,
      },
      { maxBytes: 500 },
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["file_too_large", "mime_signature_mismatch"]),
    );
  });

  it("rejects traversal/control names and creates a display-safe alternative", () => {
    const original = "../../Fixture\u0000<script>.pdf";
    const result = validatePrivateFile({
      fileName: original,
      mimeType: "application/pdf",
      sizeBytes: 100,
      header: PDF_HEADER,
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid_file_name" }),
    );
    expect(sanitizePrivateFileName(original)).not.toMatch(/[\\/<>\u0000]/);
  });

  it("rejects unsupported and unknown formats", () => {
    const result = validatePrivateFile({
      fileName: "fixture.svg",
      mimeType: "image/svg+xml",
      sizeBytes: 100,
      header: new TextEncoder().encode("<svg></svg>"),
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "unsupported_mime_type",
        "unknown_file_signature",
      ]),
    );
  });
});

describe("opaque property-scoped keys", () => {
  it("creates a stable opaque scope and a random object component", async () => {
    const propertyId = "property-fixture-alpha";
    const token = "00112233445566778899aabbccddeeff";
    const prefix = await getPrivatePropertyFilePrefix(propertyId);
    const key = await createPrivatePropertyFileKey({
      propertyId,
      category: "evidence",
      createOpaqueToken: () => token,
    });

    expect(prefix).toMatch(/^private\/p\/[a-f0-9]{64}$/);
    expect(key).toBe(`${prefix}/evidence/${token}`);
    expect(key).not.toContain(propertyId);
    expect(key).not.toContain("jpg");
    await expect(isPrivateFileKeyScopedToProperty(key, propertyId)).resolves.toBe(
      true,
    );
    await expect(
      isPrivateFileKeyScopedToProperty(key, "property-fixture-beta"),
    ).resolves.toBe(false);
  });

  it("uses a portable Web Crypto SHA-256 implementation", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
