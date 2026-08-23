import { z } from "zod";

export const PROPERTY_MANIFEST_FORMAT = "circuit-atlas/property" as const;
export const CURRENT_PROPERTY_MANIFEST_VERSION = 1 as const;
export const PROPERTY_MANIFEST_CHECKSUM_ALGORITHM = "SHA-256" as const;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string(),
  jsonValueSchema,
);

export const portableIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    "Identifiers may contain letters, numbers, dots, underscores, colons, and hyphens.",
  );

const portableKindSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9._-]*$/);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const revisionSchema = z.number().int().nonnegative();

export const portablePropertySchema = z
  .object({
    id: portableIdSchema,
    revision: revisionSchema,
    data: jsonObjectSchema,
  })
  .strict();

export const portableRecordSchema = z
  .object({
    id: portableIdSchema,
    propertyId: portableIdSchema,
    kind: portableKindSchema,
    revision: revisionSchema,
    data: jsonObjectSchema,
  })
  .strict();

export const portableRelationshipEndpointSchema = z
  .object({
    recordId: portableIdSchema,
    role: portableKindSchema.optional(),
  })
  .strict();

export const portableRelationshipSchema = z
  .object({
    id: portableIdSchema,
    propertyId: portableIdSchema,
    kind: portableKindSchema,
    revision: revisionSchema,
    from: portableRelationshipEndpointSchema,
    to: portableRelationshipEndpointSchema,
    data: jsonObjectSchema,
  })
  .strict();

export const portableAttachmentOwnerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("property"),
      id: portableIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("record"),
      id: portableIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("relationship"),
      id: portableIdSchema,
    })
    .strict(),
]);

export const portableAttachmentSchema = z
  .object({
    id: portableIdSchema,
    propertyId: portableIdSchema,
    revision: revisionSchema,
    owner: portableAttachmentOwnerSchema,
    purpose: portableKindSchema,
    originalName: z
      .string()
      .min(1)
      .max(255)
      .refine((name) => !/[\\/\u0000-\u001f\u007f]/.test(name), {
        message: "Attachment names cannot contain path or control characters.",
      }),
    mediaType: z.string().min(1).max(127),
    byteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    archivePath: z
      .string()
      .regex(/^attachments\/[A-Za-z0-9][A-Za-z0-9._:-]*$/)
      .optional(),
    data: jsonObjectSchema,
  })
  .strict();

export const attachmentChecksumSchema = z
  .object({
    attachmentId: portableIdSchema,
    sha256: sha256Schema,
  })
  .strict();

export const propertyManifestChecksumsSchema = z
  .object({
    algorithm: z.literal(PROPERTY_MANIFEST_CHECKSUM_ALGORITHM),
    manifestSha256: sha256Schema,
    attachments: z.array(attachmentChecksumSchema),
  })
  .strict();

export const propertyManifestV1Schema = z
  .object({
    format: z.literal(PROPERTY_MANIFEST_FORMAT),
    schemaVersion: z.literal(CURRENT_PROPERTY_MANIFEST_VERSION),
    exportId: portableIdSchema,
    exportedAt: z.iso.datetime({ offset: true }),
    generator: z
      .object({
        name: z.literal("Circuit Atlas"),
        version: z.string().min(1).max(64),
      })
      .strict(),
    property: portablePropertySchema,
    records: z.array(portableRecordSchema),
    relationships: z.array(portableRelationshipSchema),
    attachments: z.array(portableAttachmentSchema),
    checksums: propertyManifestChecksumsSchema,
  })
  .strict();

/** Add later schema versions to this union while retaining old readers. */
export const propertyManifestSchema = z.discriminatedUnion("schemaVersion", [
  propertyManifestV1Schema,
]);

export type PortableProperty = z.infer<typeof portablePropertySchema>;
export type PortableRecord = z.infer<typeof portableRecordSchema>;
export type PortableRelationship = z.infer<typeof portableRelationshipSchema>;
export type PortableAttachment = z.infer<typeof portableAttachmentSchema>;
export type AttachmentChecksum = z.infer<typeof attachmentChecksumSchema>;
export type PropertyManifestV1 = z.infer<typeof propertyManifestV1Schema>;
export type PropertyManifest = z.infer<typeof propertyManifestSchema>;
export type UnsealedPropertyManifestV1 = Omit<PropertyManifestV1, "checksums"> & {
  checksums: Omit<PropertyManifestV1["checksums"], "manifestSha256">;
};
