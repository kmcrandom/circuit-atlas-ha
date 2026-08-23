import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  attachments,
  changeEvents,
  floorPlans,
  levels,
} from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import {
  ConflictError,
  InvalidRequestError,
  NotFoundError,
} from "@/lib/http/responses";
import { bumpPropertyRevision } from "./core";
import { requireOwnedProperty } from "./workspaces";

const FLOOR_PLAN_MEDIA_TYPES = new Set([
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type FloorPlanView = {
  id: string;
  propertyId: string;
  levelId: string;
  name: string;
  pageNumber: number | null;
  unitsPerPlanUnit: number | null;
  calibrationUnit: string | null;
  orientationDegrees: number;
  lifecycleState: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  backgroundAttachment: null | {
    id: string;
    originalFileName: string;
    mimeType: string;
    byteSize: number;
    widthPixels: number | null;
    heightPixels: number | null;
    pageCount: number | null;
    altText: string | null;
    revision: number;
    contentPath: string;
    /** Compatibility alias; this is an authenticated route, never a storage path. */
    downloadUrl: string;
  };
};

export type CreateFloorPlanInput = {
  id?: string;
  levelId: string;
  name: string;
  backgroundAttachmentId?: string | null;
  pageNumber?: number | null;
  unitsPerPlanUnit?: number | null;
  calibrationUnit?: "in" | "ft" | "mm" | "cm" | "m" | null;
  orientationDegrees?: number;
};

export type UpdateFloorPlanInput = Partial<
  Omit<CreateFloorPlanInput, "id" | "levelId">
> & {
  levelId?: string;
  revision: number;
};

function attachmentContentPath(propertyId: string, attachmentId: string) {
  return `/api/p/${encodeURIComponent(propertyId)}/files/${encodeURIComponent(attachmentId)}`;
}

function toView(
  row: typeof floorPlans.$inferSelect,
  attachment: typeof attachments.$inferSelect | null,
): FloorPlanView {
  const contentPath = attachment
    ? attachmentContentPath(row.propertyId, attachment.id)
    : null;
  return {
    ...row,
    backgroundAttachment:
      attachment && contentPath
        ? {
            id: attachment.id,
            originalFileName: attachment.originalFileName,
            mimeType: attachment.mimeType,
            byteSize: attachment.byteSize,
            widthPixels: attachment.widthPixels,
            heightPixels: attachment.heightPixels,
            pageCount: attachment.pageCount,
            altText: attachment.altText,
            revision: attachment.revision,
            contentPath,
            downloadUrl: contentPath,
          }
        : null,
  };
}

async function requireLevel(propertyId: string, levelId: string) {
  const level = await getDb().query.levels.findFirst({
    where: and(
      eq(levels.propertyId, propertyId),
      eq(levels.id, levelId),
      ne(levels.lifecycleState, "archived"),
    ),
  });
  if (!level) throw new InvalidRequestError("The selected level is not part of this property.");
  return level;
}

async function requireFloorPlanAttachment(
  propertyId: string,
  floorPlanId: string,
  attachmentId: string,
) {
  const attachment = await getDb().query.attachments.findFirst({
    where: and(
      eq(attachments.propertyId, propertyId),
      eq(attachments.id, attachmentId),
      eq(attachments.lifecycleState, "active"),
    ),
  });
  if (!attachment) {
    throw new InvalidRequestError("The selected background file is not part of this property.");
  }
  if (!FLOOR_PLAN_MEDIA_TYPES.has(attachment.mimeType)) {
    throw new InvalidRequestError("The selected background is not a supported image or PDF.");
  }
  const attachedToPlan =
    attachment.ownerType === "floor_plan" && attachment.ownerId === floorPlanId;
  const stagedForProperty =
    attachment.ownerType === "property" && attachment.ownerId === propertyId;
  if (!attachedToPlan && !stagedForProperty) {
    throw new InvalidRequestError("The selected file is not available as a floor-plan background.");
  }
  return attachment;
}

async function appendFloorPlanEvent(
  identity: RequestIdentity,
  propertyId: string,
  floorPlanId: string,
  eventKind: "create" | "update" | "archive",
  revision: number,
) {
  await getDb().insert(changeEvents).values({
    id: crypto.randomUUID(),
    propertyId,
    actorSubject: identity.externalUserId,
    eventKind,
    entityType: "floor-plan",
    entityId: floorPlanId,
    entityRevision: revision,
    summary: `${eventKind} floor-plan`,
  });
}

export async function listFloorPlans(
  identity: RequestIdentity,
  propertyId: string,
): Promise<FloorPlanView[]> {
  await requireOwnedProperty(identity, propertyId);
  const rows = await getDb()
    .select({ floorPlan: floorPlans, attachment: attachments })
    .from(floorPlans)
    .leftJoin(
      attachments,
      and(
        eq(attachments.propertyId, floorPlans.propertyId),
        eq(attachments.id, floorPlans.backgroundAttachmentId),
        eq(attachments.lifecycleState, "active"),
      ),
    )
    .where(
      and(
        eq(floorPlans.propertyId, propertyId),
        ne(floorPlans.lifecycleState, "archived"),
      ),
    )
    .orderBy(asc(floorPlans.name), asc(floorPlans.id));
  return rows.map(({ floorPlan, attachment }) => toView(floorPlan, attachment));
}

export async function getFloorPlan(
  identity: RequestIdentity,
  propertyId: string,
  floorPlanId: string,
): Promise<FloorPlanView> {
  await requireOwnedProperty(identity, propertyId);
  const result = await getDb()
    .select({ floorPlan: floorPlans, attachment: attachments })
    .from(floorPlans)
    .leftJoin(
      attachments,
      and(
        eq(attachments.propertyId, floorPlans.propertyId),
        eq(attachments.id, floorPlans.backgroundAttachmentId),
        eq(attachments.lifecycleState, "active"),
      ),
    )
    .where(
      and(
        eq(floorPlans.propertyId, propertyId),
        eq(floorPlans.id, floorPlanId),
        ne(floorPlans.lifecycleState, "archived"),
      ),
    )
    .limit(1);
  if (!result[0]) throw new NotFoundError("Floor plan not found.");
  return toView(result[0].floorPlan, result[0].attachment);
}

export async function createFloorPlan(
  identity: RequestIdentity,
  propertyId: string,
  input: CreateFloorPlanInput,
): Promise<FloorPlanView> {
  await requireOwnedProperty(identity, propertyId);
  await requireLevel(propertyId, input.levelId);
  const id = input.id ?? crypto.randomUUID();
  if (input.backgroundAttachmentId) {
    await requireFloorPlanAttachment(propertyId, id, input.backgroundAttachmentId);
  }
  await getDb().insert(floorPlans).values({
    id,
    propertyId,
    levelId: input.levelId,
    name: input.name,
    backgroundAttachmentId: input.backgroundAttachmentId ?? null,
    pageNumber: input.pageNumber ?? null,
    unitsPerPlanUnit: input.unitsPerPlanUnit ?? null,
    calibrationUnit: input.calibrationUnit ?? null,
    orientationDegrees: input.orientationDegrees ?? 0,
  });
  if (input.backgroundAttachmentId) {
    await getDb()
      .update(attachments)
      .set({
        ownerType: "floor_plan",
        ownerId: id,
        revision: sql`${attachments.revision} + 1`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(attachments.propertyId, propertyId),
          eq(attachments.id, input.backgroundAttachmentId),
          eq(attachments.ownerType, "property"),
          eq(attachments.ownerId, propertyId),
        ),
      );
  }
  await bumpPropertyRevision(propertyId);
  await appendFloorPlanEvent(identity, propertyId, id, "create", 1);
  return getFloorPlan(identity, propertyId, id);
}

export async function updateFloorPlan(
  identity: RequestIdentity,
  propertyId: string,
  floorPlanId: string,
  input: UpdateFloorPlanInput,
): Promise<FloorPlanView> {
  await requireOwnedProperty(identity, propertyId);
  if (input.levelId) await requireLevel(propertyId, input.levelId);
  if (input.backgroundAttachmentId) {
    await requireFloorPlanAttachment(
      propertyId,
      floorPlanId,
      input.backgroundAttachmentId,
    );
  }
  const patch: Record<string, unknown> = {
    updatedAt: sql`CURRENT_TIMESTAMP`,
    revision: sql`${floorPlans.revision} + 1`,
  };
  if (input.levelId !== undefined) patch.levelId = input.levelId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.backgroundAttachmentId !== undefined) {
    patch.backgroundAttachmentId = input.backgroundAttachmentId;
  }
  if (input.pageNumber !== undefined) patch.pageNumber = input.pageNumber;
  if (input.unitsPerPlanUnit !== undefined) {
    patch.unitsPerPlanUnit = input.unitsPerPlanUnit;
  }
  if (input.calibrationUnit !== undefined) {
    patch.calibrationUnit = input.calibrationUnit;
  }
  if (input.orientationDegrees !== undefined) {
    patch.orientationDegrees = input.orientationDegrees;
  }

  const result = await getDb()
    .update(floorPlans)
    .set(patch as never)
    .where(
      and(
        eq(floorPlans.propertyId, propertyId),
        eq(floorPlans.id, floorPlanId),
        eq(floorPlans.revision, input.revision),
        ne(floorPlans.lifecycleState, "archived"),
      ),
    );
  if (result.changes !== 1) {
    const existing = await getDb().query.floorPlans.findFirst({
      where: and(
        eq(floorPlans.propertyId, propertyId),
        eq(floorPlans.id, floorPlanId),
        ne(floorPlans.lifecycleState, "archived"),
      ),
    });
    if (!existing) throw new NotFoundError("Floor plan not found.");
    throw new ConflictError("This floor plan changed after it was loaded.");
  }
  if (input.backgroundAttachmentId) {
    await getDb()
      .update(attachments)
      .set({
        ownerType: "floor_plan",
        ownerId: floorPlanId,
        revision: sql`${attachments.revision} + 1`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(attachments.propertyId, propertyId),
          eq(attachments.id, input.backgroundAttachmentId),
          eq(attachments.ownerType, "property"),
          eq(attachments.ownerId, propertyId),
        ),
      );
  }
  await bumpPropertyRevision(propertyId);
  await appendFloorPlanEvent(
    identity,
    propertyId,
    floorPlanId,
    "update",
    input.revision + 1,
  );
  return getFloorPlan(identity, propertyId, floorPlanId);
}

export async function archiveFloorPlan(
  identity: RequestIdentity,
  propertyId: string,
  floorPlanId: string,
  revision: number,
): Promise<FloorPlanView> {
  await getFloorPlan(identity, propertyId, floorPlanId);
  const result = await getDb()
    .update(floorPlans)
    .set({
      lifecycleState: "archived",
      revision: sql`${floorPlans.revision} + 1`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(
      and(
        eq(floorPlans.propertyId, propertyId),
        eq(floorPlans.id, floorPlanId),
        eq(floorPlans.revision, revision),
        ne(floorPlans.lifecycleState, "archived"),
      ),
    );
  if (result.changes !== 1) {
    throw new ConflictError("This floor plan changed after it was loaded.");
  }
  await bumpPropertyRevision(propertyId);
  await appendFloorPlanEvent(
    identity,
    propertyId,
    floorPlanId,
    "archive",
    revision + 1,
  );
  return {
    ...(await getDb().query.floorPlans.findFirst({
      where: and(
        eq(floorPlans.propertyId, propertyId),
        eq(floorPlans.id, floorPlanId),
      ),
    }))!,
    backgroundAttachment: null,
  };
}

export async function setFloorPlanBackground(
  identity: RequestIdentity,
  propertyId: string,
  floorPlanId: string,
  attachmentId: string,
  revision: number,
): Promise<FloorPlanView> {
  return updateFloorPlan(identity, propertyId, floorPlanId, {
    revision,
    backgroundAttachmentId: attachmentId,
  });
}
