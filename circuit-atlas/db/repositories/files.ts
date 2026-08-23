import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, runStatementsAtomically } from "@/db";
import {
  assetCircuitAssertions,
  assets,
  attachments,
  captureDrafts,
  changeEvents,
  evidence,
  floorPlans,
  propertyRevisions,
  upgradeItems,
} from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import { getPrivateFileStore } from "@/lib/files/local-store";
import {
  createPrivatePropertyFileKey,
  isPrivateFileKeyScopedToProperty,
  normalizePrivateFileMimeType,
  PRIVATE_FILE_CATEGORIES,
  sha256Hex,
  validatePrivateFile,
  type PrivateFileCategory,
  type PrivateFileMimeType,
} from "@/lib/files";
import {
  ConflictError,
  InvalidRequestError,
  NotFoundError,
} from "@/lib/http/responses";
import { bumpPropertyRevision } from "./core";
import { requireOwnedProperty } from "./workspaces";

export const PRIVATE_FILE_OWNER_TYPES = [
  "property",
  "asset",
  "evidence",
  "assertion",
  "floor_plan",
  "capture_draft",
  "upgrade_item",
] as const;

export type PrivateFileOwnerType =
  (typeof PRIVATE_FILE_OWNER_TYPES)[number];

type Attachment = typeof attachments.$inferSelect;
export type PrivateFileInfo = Omit<Attachment, "objectKey">;

export type PrivateFileListOptions = {
  ownerType?: PrivateFileOwnerType;
  ownerId?: string;
  includeArchived?: boolean;
};

export type CreatePrivateFileInput = {
  ownerType: PrivateFileOwnerType;
  ownerId: string;
  category: PrivateFileCategory;
  originalFileName: string;
  declaredMimeType: string;
  bytes: ArrayBuffer;
  altText?: string | null;
  widthPixels?: number | null;
  heightPixels?: number | null;
  pageCount?: number | null;
};

export type PrivateFileMutationContext = {
  identity: RequestIdentity;
  propertyId: string;
  requestId?: string | null;
};

export type PrivateFileBody = {
  info: PrivateFileInfo;
  body: ReadableStream;
  size: number;
};

function withoutObjectKey(record: Attachment): PrivateFileInfo {
  const { objectKey, ...info } = record;
  void objectKey;
  return info;
}

function positiveOptionalInteger(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidRequestError(`${field} must be a positive integer.`);
  }
  return value;
}

async function getActiveAttachmentRecord(
  propertyId: string,
  fileId: string,
): Promise<Attachment> {
  const db = getDb();
  const record = await db.query.attachments.findFirst({
    where: and(
      eq(attachments.propertyId, propertyId),
      eq(attachments.id, fileId),
      eq(attachments.lifecycleState, "active"),
    ),
  });
  if (!record) throw new NotFoundError("File not found.");
  return record;
}

async function requireAttachmentOwner(
  propertyId: string,
  ownerType: PrivateFileOwnerType,
  ownerId: string,
): Promise<void> {
  if (ownerType === "property") {
    if (ownerId !== propertyId) {
      throw new InvalidRequestError(
        "A property attachment must name the current property as its owner.",
      );
    }
    return;
  }

  const db = getDb();
  const record =
    ownerType === "asset"
      ? await db.query.assets.findFirst({
          where: and(
            eq(assets.propertyId, propertyId),
            eq(assets.id, ownerId),
            eq(assets.lifecycleState, "active"),
          ),
        })
      : ownerType === "evidence"
        ? await db.query.evidence.findFirst({
            where: and(
              eq(evidence.propertyId, propertyId),
              eq(evidence.id, ownerId),
            ),
          })
        : ownerType === "assertion"
          ? await db.query.assetCircuitAssertions.findFirst({
              where: and(
                eq(assetCircuitAssertions.propertyId, propertyId),
                eq(assetCircuitAssertions.id, ownerId),
              ),
            })
          : ownerType === "floor_plan"
            ? await db.query.floorPlans.findFirst({
                where: and(
                  eq(floorPlans.propertyId, propertyId),
                  eq(floorPlans.id, ownerId),
                  eq(floorPlans.lifecycleState, "active"),
                ),
              })
            : ownerType === "capture_draft"
              ? await db.query.captureDrafts.findFirst({
                  where: and(
                    eq(captureDrafts.propertyId, propertyId),
                    eq(captureDrafts.id, ownerId),
                  ),
                })
              : await db.query.upgradeItems.findFirst({
                  where: and(
                    eq(upgradeItems.propertyId, propertyId),
                    eq(upgradeItems.id, ownerId),
                  ),
                });

  if (!record) {
    throw new InvalidRequestError(
      "The attachment owner does not exist in this property.",
    );
  }
}

async function appendFileChangeEvent(
  context: PrivateFileMutationContext,
  fileId: string,
  eventKind: "create" | "archive",
  revision: number,
): Promise<void> {
  const db = getDb();
  await db.insert(changeEvents).values({
    id: crypto.randomUUID(),
    propertyId: context.propertyId,
    actorSubject: context.identity.externalUserId,
    eventKind,
    entityType: "attachment",
    entityId: fileId,
    entityRevision: revision,
    requestId: context.requestId ?? null,
    summary: `${eventKind} attachment`,
  });
}

export async function listPrivateFiles(
  identity: RequestIdentity,
  propertyId: string,
  options: PrivateFileListOptions = {},
): Promise<PrivateFileInfo[]> {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const conditions: SQL[] = [
    eq(attachments.propertyId, propertyId),
    options.includeArchived
      ? inArray(attachments.lifecycleState, ["active", "archived"])
      : eq(attachments.lifecycleState, "active"),
  ];
  if (options.ownerType) {
    conditions.push(eq(attachments.ownerType, options.ownerType));
  }
  if (options.ownerId) {
    conditions.push(eq(attachments.ownerId, options.ownerId));
  }

  const records = await db
    .select()
    .from(attachments)
    .where(and(...conditions))
    .orderBy(desc(attachments.createdAt), desc(attachments.id));
  return records.map(withoutObjectKey);
}

export async function createPrivateFile(
  context: PrivateFileMutationContext,
  input: CreatePrivateFileInput,
): Promise<PrivateFileInfo> {
  await requireOwnedProperty(context.identity, context.propertyId);
  if (
    !PRIVATE_FILE_OWNER_TYPES.includes(input.ownerType) ||
    !input.ownerId ||
    input.ownerId !== input.ownerId.trim() ||
    input.ownerId.length > 128
  ) {
    throw new InvalidRequestError("The attachment owner is invalid.");
  }
  if (!PRIVATE_FILE_CATEGORIES.includes(input.category)) {
    throw new InvalidRequestError("The private-file category is invalid.");
  }
  const altText = input.altText?.trim() || null;
  if (altText && altText.length > 1_000) {
    throw new InvalidRequestError("altText must be no longer than 1000 characters.");
  }
  await requireAttachmentOwner(
    context.propertyId,
    input.ownerType,
    input.ownerId,
  );

  const validation = validatePrivateFile({
    fileName: input.originalFileName,
    mimeType: input.declaredMimeType,
    sizeBytes: input.bytes.byteLength,
    header: input.bytes.slice(0, 32),
  });
  if (!validation.valid) {
    throw new InvalidRequestError(
      validation.issues.map((issue) => issue.message).join(" "),
    );
  }

  const id = crypto.randomUUID();
  const objectKey = await createPrivatePropertyFileKey({
    propertyId: context.propertyId,
    category: input.category,
  });
  const checksum = await sha256Hex(input.bytes);
  const widthPixels = positiveOptionalInteger(
    input.widthPixels,
    "widthPixels",
  );
  const heightPixels = positiveOptionalInteger(
    input.heightPixels,
    "heightPixels",
  );
  const pageCount = positiveOptionalInteger(input.pageCount, "pageCount");
  const mimeType: PrivateFileMimeType = validation.mimeType;
  const bucket = getPrivateFileStore();

  await bucket.put(objectKey, input.bytes);

  const db = getDb();
  try {
    const insertAttachment = db.insert(attachments).values({
      id,
      propertyId: context.propertyId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      objectKey,
      originalFileName: validation.sanitizedName,
      mimeType,
      byteSize: validation.sizeBytes,
      sha256: checksum,
      widthPixels,
      heightPixels,
      pageCount,
      altText,
    });
    const reviseProperty = db
      .update(propertyRevisions)
      .set({
        dataRevision: sql`${propertyRevisions.dataRevision} + 1`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(propertyRevisions.propertyId, context.propertyId));
    const insertChangeEvent = db.insert(changeEvents).values({
      id: crypto.randomUUID(),
      propertyId: context.propertyId,
      actorSubject: context.identity.externalUserId,
      eventKind: "create",
      entityType: "attachment",
      entityId: id,
      entityRevision: 1,
      requestId: context.requestId ?? null,
      summary: "create attachment",
    });
    runStatementsAtomically([insertAttachment, reviseProperty, insertChangeEvent]);
  } catch (error) {
    await bucket.delete(objectKey).catch(() => undefined);
    if (String(error).toLowerCase().includes("unique")) {
      throw new ConflictError("A private-file identifier collision occurred.");
    }
    throw error;
  }

  return withoutObjectKey(await getActiveAttachmentRecord(context.propertyId, id));
}

export async function readPrivateFile(
  identity: RequestIdentity,
  propertyId: string,
  fileId: string,
): Promise<PrivateFileBody> {
  await requireOwnedProperty(identity, propertyId);
  const record = await getActiveAttachmentRecord(propertyId, fileId);
  if (!(await isPrivateFileKeyScopedToProperty(record.objectKey, propertyId))) {
    throw new NotFoundError("File not found.");
  }
  if (!normalizePrivateFileMimeType(record.mimeType)) {
    throw new NotFoundError("File not found.");
  }

  const object = await getPrivateFileStore().get(record.objectKey);
  if (!object) throw new NotFoundError("File not found.");
  if (object.size !== record.byteSize) {
    throw new Error("Private file metadata does not match the stored object.");
  }
  return {
    info: withoutObjectKey(record),
    body: object.body,
    size: object.size,
  };
}

export async function archivePrivateFile(
  context: PrivateFileMutationContext,
  fileId: string,
  revision: number,
): Promise<PrivateFileInfo> {
  await requireOwnedProperty(context.identity, context.propertyId);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new InvalidRequestError("A positive revision is required.");
  }

  const db = getDb();
  const result = await db
    .update(attachments)
    .set({
      lifecycleState: "archived",
      revision: sql`${attachments.revision} + 1`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(
      and(
        eq(attachments.propertyId, context.propertyId),
        eq(attachments.id, fileId),
        eq(attachments.revision, revision),
        eq(attachments.lifecycleState, "active"),
      ),
    );

  if (result.changes !== 1) {
    const existing = await db.query.attachments.findFirst({
      where: and(
        eq(attachments.propertyId, context.propertyId),
        eq(attachments.id, fileId),
      ),
    });
    if (!existing || existing.lifecycleState !== "active") {
      throw new NotFoundError("File not found.");
    }
    throw new ConflictError("This file changed after it was loaded.");
  }

  await bumpPropertyRevision(context.propertyId);
  await appendFileChangeEvent(context, fileId, "archive", revision + 1);
  const archived = await db.query.attachments.findFirst({
    where: and(
      eq(attachments.propertyId, context.propertyId),
      eq(attachments.id, fileId),
    ),
  });
  if (!archived) throw new NotFoundError("File not found.");
  return withoutObjectKey(archived);
}
