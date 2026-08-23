import { canonicalJson } from "./serialize";
import { type PropertyManifestV1 } from "./schema";
import {
  validatePropertyManifest,
  type ManifestValidationIssue,
} from "./validate";

export type ImportMode = "add" | "merge";
export type ImportEntityKind =
  | "property"
  | "record"
  | "relationship"
  | "attachment";
export type ImportAction = "create" | "update" | "unchanged" | "conflict";

export interface ImportPreviewOutcome {
  entityKind: ImportEntityKind;
  entityType: string;
  id: string;
  action: ImportAction;
  reason:
    | "new_entity"
    | "identical"
    | "newer_revision"
    | "divergent_equal_revision"
    | "stale_revision"
    | "type_mismatch"
    | "property_mismatch"
    | "property_already_exists";
  incomingRevision: number;
  existingRevision: number | null;
}

export interface ImportPreviewSummary {
  create: number;
  update: number;
  unchanged: number;
  conflict: number;
  preservedExisting: number;
}

export interface ImportPreview {
  mode: ImportMode;
  canApply: boolean;
  incomingPropertyId: string | null;
  targetPropertyId: string | null;
  validationIssues: ManifestValidationIssue[];
  outcomes: ImportPreviewOutcome[];
  summary: ImportPreviewSummary;
}

export interface PreviewPropertyImportInput {
  incoming: unknown;
  mode: ImportMode;
  /** A trusted export-shaped snapshot of the target property, when one exists. */
  target?: PropertyManifestV1 | null;
}

interface ComparableEntity {
  entityKind: ImportEntityKind;
  entityType: string;
  id: string;
  revision: number;
  content: unknown;
}

function entitiesOf(manifest: PropertyManifestV1): ComparableEntity[] {
  const attachmentChecksums = new Map(
    manifest.checksums.attachments.map((checksum) => [
      checksum.attachmentId,
      checksum.sha256,
    ]),
  );

  return [
    {
      entityKind: "property",
      entityType: "property",
      id: manifest.property.id,
      revision: manifest.property.revision,
      content: manifest.property,
    },
    ...manifest.records.map((record) => ({
      entityKind: "record" as const,
      entityType: record.kind,
      id: record.id,
      revision: record.revision,
      content: record,
    })),
    ...manifest.relationships.map((relationship) => ({
      entityKind: "relationship" as const,
      entityType: relationship.kind,
      id: relationship.id,
      revision: relationship.revision,
      content: relationship,
    })),
    ...manifest.attachments.map((attachment) => ({
      entityKind: "attachment" as const,
      entityType: attachment.purpose,
      id: attachment.id,
      revision: attachment.revision,
      content: {
        ...attachment,
        sha256: attachmentChecksums.get(attachment.id),
      },
    })),
  ];
}

function withoutRevision(entity: ComparableEntity): unknown {
  if (
    entity.content !== null &&
    typeof entity.content === "object" &&
    !Array.isArray(entity.content)
  ) {
    const content: Record<string, unknown> = { ...entity.content };
    delete content.revision;
    return content;
  }
  return entity.content;
}

function sameContent(
  incoming: ComparableEntity,
  existing: ComparableEntity,
): boolean {
  return (
    incoming.entityType === existing.entityType &&
    canonicalJson(withoutRevision(incoming)) ===
      canonicalJson(withoutRevision(existing))
  );
}

function outcomeForMerge(
  incoming: ComparableEntity,
  existing: ComparableEntity | undefined,
): ImportPreviewOutcome {
  if (!existing) {
    return {
      entityKind: incoming.entityKind,
      entityType: incoming.entityType,
      id: incoming.id,
      action: "create",
      reason: "new_entity",
      incomingRevision: incoming.revision,
      existingRevision: null,
    };
  }

  if (incoming.entityType !== existing.entityType) {
    return {
      entityKind: incoming.entityKind,
      entityType: incoming.entityType,
      id: incoming.id,
      action: "conflict",
      reason: "type_mismatch",
      incomingRevision: incoming.revision,
      existingRevision: existing.revision,
    };
  }

  if (sameContent(incoming, existing)) {
    return {
      entityKind: incoming.entityKind,
      entityType: incoming.entityType,
      id: incoming.id,
      action: "unchanged",
      reason: "identical",
      incomingRevision: incoming.revision,
      existingRevision: existing.revision,
    };
  }

  if (incoming.revision > existing.revision) {
    return {
      entityKind: incoming.entityKind,
      entityType: incoming.entityType,
      id: incoming.id,
      action: "update",
      reason: "newer_revision",
      incomingRevision: incoming.revision,
      existingRevision: existing.revision,
    };
  }

  return {
    entityKind: incoming.entityKind,
    entityType: incoming.entityType,
    id: incoming.id,
    action: "conflict",
    reason:
      incoming.revision === existing.revision
        ? "divergent_equal_revision"
        : "stale_revision",
    incomingRevision: incoming.revision,
    existingRevision: existing.revision,
  };
}

function summarize(
  outcomes: readonly ImportPreviewOutcome[],
  preservedExisting: number,
): ImportPreviewSummary {
  return outcomes.reduce<ImportPreviewSummary>(
    (summary, outcome) => ({
      ...summary,
      [outcome.action]: summary[outcome.action] + 1,
    }),
    {
      create: 0,
      update: 0,
      unchanged: 0,
      conflict: 0,
      preservedExisting,
    },
  );
}

export async function previewPropertyImport({
  incoming,
  mode,
  target = null,
}: PreviewPropertyImportInput): Promise<ImportPreview> {
  const validation = await validatePropertyManifest(incoming);
  const incomingPropertyId = validation.manifest?.property.id ?? null;
  const targetPropertyId = target?.property.id ?? null;

  if (!validation.valid || !validation.manifest) {
    return {
      mode,
      canApply: false,
      incomingPropertyId,
      targetPropertyId,
      validationIssues: validation.issues,
      outcomes: [],
      summary: summarize([], target ? entitiesOf(target).length : 0),
    };
  }

  const incomingEntities = entitiesOf(validation.manifest);

  if (mode === "add") {
    const outcomes = incomingEntities.map<ImportPreviewOutcome>((entity) => ({
      entityKind: entity.entityKind,
      entityType: entity.entityType,
      id: entity.id,
      action: target ? "conflict" : "create",
      reason: target ? "property_already_exists" : "new_entity",
      incomingRevision: entity.revision,
      existingRevision:
        target && entity.entityKind === "property"
          ? target.property.revision
          : null,
    }));
    return {
      mode,
      canApply: !target,
      incomingPropertyId,
      targetPropertyId,
      validationIssues: [],
      outcomes,
      summary: summarize(outcomes, target ? entitiesOf(target).length : 0),
    };
  }

  if (!target || target.property.id !== validation.manifest.property.id) {
    const outcomes = incomingEntities.map<ImportPreviewOutcome>((entity) => ({
      entityKind: entity.entityKind,
      entityType: entity.entityType,
      id: entity.id,
      action: "conflict",
      reason: "property_mismatch",
      incomingRevision: entity.revision,
      existingRevision: null,
    }));
    return {
      mode,
      canApply: false,
      incomingPropertyId,
      targetPropertyId,
      validationIssues: [],
      outcomes,
      summary: summarize(outcomes, target ? entitiesOf(target).length : 0),
    };
  }

  const targetEntities = entitiesOf(target);
  const targetByCompoundId = new Map(
    targetEntities.map((entity) => [
      `${entity.entityKind}:${entity.id}`,
      entity,
    ]),
  );
  const outcomes = incomingEntities.map((entity) =>
    outcomeForMerge(
      entity,
      targetByCompoundId.get(`${entity.entityKind}:${entity.id}`),
    ),
  );
  const incomingKeys = new Set(
    incomingEntities.map((entity) => `${entity.entityKind}:${entity.id}`),
  );
  const preservedExisting = targetEntities.filter(
    (entity) => !incomingKeys.has(`${entity.entityKind}:${entity.id}`),
  ).length;

  return {
    mode,
    canApply: outcomes.every((outcome) => outcome.action !== "conflict"),
    incomingPropertyId,
    targetPropertyId,
    validationIssues: [],
    outcomes,
    summary: summarize(outcomes, preservedExisting),
  };
}
