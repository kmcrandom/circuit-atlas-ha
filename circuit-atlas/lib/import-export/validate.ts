import type { z } from "zod";
import {
  propertyManifestSchema,
  type PropertyManifest,
  type PropertyManifestV1,
} from "./schema";
import { verifyManifestChecksum } from "./checksum";

export type ManifestValidationIssueCode =
  | "schema_error"
  | "property_boundary"
  | "duplicate_id"
  | "dangling_reference"
  | "missing_attachment_checksum"
  | "duplicate_attachment_checksum"
  | "orphan_attachment_checksum"
  | "duplicate_archive_path"
  | "manifest_checksum_mismatch";

export interface ManifestValidationIssue {
  code: ManifestValidationIssueCode;
  path: (string | number)[];
  message: string;
}

export type PropertyManifestValidationResult =
  | {
      valid: true;
      manifest: PropertyManifest;
      issues: [];
    }
  | {
      valid: false;
      manifest: PropertyManifest | null;
      issues: ManifestValidationIssue[];
    };

function schemaIssues(error: z.ZodError): ManifestValidationIssue[] {
  return error.issues.map((issue) => ({
    code: "schema_error",
    path: issue.path.map((segment) =>
      typeof segment === "symbol" ? segment.description ?? "symbol" : segment,
    ),
    message: issue.message,
  }));
}

function duplicateIds(
  ids: readonly { id: string; path: (string | number)[] }[],
): ManifestValidationIssue[] {
  const firstPathById = new Map<string, (string | number)[]>();
  const issues: ManifestValidationIssue[] = [];

  for (const item of ids) {
    const firstPath = firstPathById.get(item.id);
    if (firstPath) {
      issues.push({
        code: "duplicate_id",
        path: item.path,
        message: `ID ${item.id} is already used at ${firstPath.join(".")}.`,
      });
    } else {
      firstPathById.set(item.id, item.path);
    }
  }

  return issues;
}

/** Validates references and ownership rules that cannot be expressed in Zod. */
export function validateManifestRelationships(
  manifest: PropertyManifestV1,
): ManifestValidationIssue[] {
  const issues: ManifestValidationIssue[] = [];
  const propertyId = manifest.property.id;
  const recordIds = new Set(manifest.records.map((record) => record.id));
  const relationshipIds = new Set(
    manifest.relationships.map((relationship) => relationship.id),
  );
  const attachmentIds = new Set(
    manifest.attachments.map((attachment) => attachment.id),
  );

  issues.push(
    ...duplicateIds([
      ...manifest.records.map((record, index) => ({
        id: record.id,
        path: ["records", index, "id"] as (string | number)[],
      })),
      ...manifest.relationships.map((relationship, index) => ({
        id: relationship.id,
        path: ["relationships", index, "id"] as (string | number)[],
      })),
      ...manifest.attachments.map((attachment, index) => ({
        id: attachment.id,
        path: ["attachments", index, "id"] as (string | number)[],
      })),
    ]),
  );

  manifest.records.forEach((record, index) => {
    if (record.propertyId !== propertyId) {
      issues.push({
        code: "property_boundary",
        path: ["records", index, "propertyId"],
        message: "The record belongs to a different property.",
      });
    }
  });

  manifest.relationships.forEach((relationship, index) => {
    if (relationship.propertyId !== propertyId) {
      issues.push({
        code: "property_boundary",
        path: ["relationships", index, "propertyId"],
        message: "The relationship belongs to a different property.",
      });
    }

    for (const endpoint of ["from", "to"] as const) {
      if (!recordIds.has(relationship[endpoint].recordId)) {
        issues.push({
          code: "dangling_reference",
          path: ["relationships", index, endpoint, "recordId"],
          message: `Relationship endpoint ${relationship[endpoint].recordId} does not resolve to an exported record.`,
        });
      }
    }
  });

  manifest.attachments.forEach((attachment, index) => {
    if (attachment.propertyId !== propertyId) {
      issues.push({
        code: "property_boundary",
        path: ["attachments", index, "propertyId"],
        message: "The attachment belongs to a different property.",
      });
    }

    const ownerExists =
      (attachment.owner.kind === "property" &&
        attachment.owner.id === propertyId) ||
      (attachment.owner.kind === "record" &&
        recordIds.has(attachment.owner.id)) ||
      (attachment.owner.kind === "relationship" &&
        relationshipIds.has(attachment.owner.id));

    if (!ownerExists) {
      issues.push({
        code:
          attachment.owner.kind === "property"
            ? "property_boundary"
            : "dangling_reference",
        path: ["attachments", index, "owner", "id"],
        message: "The attachment owner does not resolve inside this property export.",
      });
    }
  });

  const seenChecksumIds = new Set<string>();
  manifest.checksums.attachments.forEach((checksum, index) => {
    if (seenChecksumIds.has(checksum.attachmentId)) {
      issues.push({
        code: "duplicate_attachment_checksum",
        path: ["checksums", "attachments", index, "attachmentId"],
        message: "An attachment can have only one exported checksum.",
      });
    }
    seenChecksumIds.add(checksum.attachmentId);

    if (!attachmentIds.has(checksum.attachmentId)) {
      issues.push({
        code: "orphan_attachment_checksum",
        path: ["checksums", "attachments", index, "attachmentId"],
        message: "The checksum references an attachment that is not exported.",
      });
    }
  });

  manifest.attachments.forEach((attachment, index) => {
    if (!seenChecksumIds.has(attachment.id)) {
      issues.push({
        code: "missing_attachment_checksum",
        path: ["attachments", index, "id"],
        message: "Every attachment must have a content checksum.",
      });
    }
  });

  const archivePaths = new Map<string, number>();
  manifest.attachments.forEach((attachment, index) => {
    if (!attachment.archivePath) return;
    if (archivePaths.has(attachment.archivePath)) {
      issues.push({
        code: "duplicate_archive_path",
        path: ["attachments", index, "archivePath"],
        message: "Archive paths must be unique within an export.",
      });
    } else {
      archivePaths.set(attachment.archivePath, index);
    }
  });

  return issues;
}

export async function validatePropertyManifest(
  input: unknown,
): Promise<PropertyManifestValidationResult> {
  const parsed = propertyManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      manifest: null,
      issues: schemaIssues(parsed.error),
    };
  }

  const issues = validateManifestRelationships(parsed.data);
  if (!(await verifyManifestChecksum(parsed.data))) {
    issues.push({
      code: "manifest_checksum_mismatch",
      path: ["checksums", "manifestSha256"],
      message: "The manifest checksum does not match its contents.",
    });
  }

  return issues.length === 0
    ? { valid: true, manifest: parsed.data, issues: [] }
    : { valid: false, manifest: parsed.data, issues };
}
