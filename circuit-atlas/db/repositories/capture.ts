import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  getDb,
  runStatementsAtomically,
  type AtomicStatement,
} from "@/db";
import * as s from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import {
  ConflictError,
  InvalidRequestError,
  NotFoundError,
} from "@/lib/http/responses";

import { nextPropertyCode } from "./core";
import { requireOwnedProperty } from "./workspaces";

const knowledgeSchema = z.enum([
  "unknown",
  "assumed",
  "inferred",
  "observed",
  "test-verified",
]);
const draftIdSchema = z.string().trim().min(1).max(180);
const optionalText = (maximum = 1_000) =>
  z.string().trim().max(maximum).nullable().optional();

const conductorEndSchema = z.object({
  id: draftIdSchema,
  designation: z.enum(["a", "b"]),
  terminationType: z.enum([
    "terminal",
    "splice",
    "cap-open",
    "bond",
    "unknown",
  ]),
  terminationLabel: optionalText(240),
  destinationLabel: optionalText(240),
  certainty: knowledgeSchema,
}).strict();

export const captureDraftPayloadSchema = z.object({
  id: draftIdSchema,
  propertyId: z.string().uuid(),
  targetId: z.string().uuid().nullable().optional(),
  targetLabel: z.string().trim().min(1).max(240),
  locationId: z.string().uuid().nullable().optional(),
  locationLabel: optionalText(240),
  updatedAt: optionalText(80),
  box: z.object({
    assetId: z.string().uuid().nullable().optional(),
    permanentCode: optionalText(80),
    displayName: z.string().trim().max(240),
    type: optionalText(120),
    material: z.enum(["plastic", "metal", "other", "unknown"]),
    gangCount: z.number().int().positive().max(64).nullable(),
    orientation: z.enum([
      "wall-finished-side",
      "ceiling-from-below",
      "other",
      "unknown",
    ]),
    depth: optionalText(120),
  }).strict(),
  photos: z.array(z.object({
    id: draftIdSchema,
    url: z.string().max(1_000),
    category: z.enum(["overview", "close-up", "label", "other"]),
    caption: optionalText(1_000),
    uploadState: z.enum(["uploading", "ready", "failed"]).optional(),
  }).strict()).max(100),
  gangDevices: z.array(z.object({
    id: draftIdSchema,
    assetId: z.string().uuid().nullable().optional(),
    displayName: z.string().trim().min(1).max(240),
    kind: z.enum(["switch", "receptacle", "other", "unknown"]),
    gangIndex: z.number().int().positive().max(64).nullable(),
    gangSpan: z.number().int().positive().max(64).nullable(),
    rotation: z.number().finite().nullable(),
    configuration: optionalText(240),
    smartState: z.enum([
      "smart",
      "dumb",
      "smart-companion",
      "wireless-remote",
      "unknown",
    ]),
  }).strict()).max(128),
  cables: z.array(z.object({
    id: draftIdSchema,
    permanentCode: optionalText(80),
    wiringMethod: z.enum(["nm-b", "uf-b", "mc", "conduit", "custom", "unknown"]),
    rawJacketMarking: optionalText(240),
    insulatedConductorCount: z.number().int().nonnegative().max(256).nullable(),
    equipmentGroundCount: z.number().int().nonnegative().max(256).nullable(),
    gauge: optionalText(80),
    endDesignation: z.enum(["a", "b", "unknown"]),
    entrySide: z.enum(["top", "bottom", "left", "right", "back", "unknown"]),
    entryOffset: z.number().min(0).max(100).nullable(),
    otherEndpointLabel: optionalText(240),
    certainty: knowledgeSchema,
  }).strict()).max(256),
  conductors: z.array(z.object({
    id: draftIdSchema,
    permanentCode: optionalText(80),
    cableId: draftIdSchema.nullable(),
    kind: z.enum([
      "cable-core",
      "equipment-ground",
      "pigtail",
      "jumper",
      "device-lead",
      "standalone",
      "unknown",
    ]),
    observedColor: optionalText(80),
    reidentification: optionalText(120),
    gauge: optionalText(80),
    role: optionalText(120),
    ends: z.tuple([
      conductorEndSchema.extend({ designation: z.literal("a") }),
      conductorEndSchema.extend({ designation: z.literal("b") }),
    ]),
  }).strict()).max(1_024),
  notes: z.string().max(20_000),
  needsReview: z.boolean(),
}).strict().superRefine((draft, context) => {
  const uniqueCollections: Array<[string, Array<{ id: string }>]> = [
    ["photos", draft.photos],
    ["gangDevices", draft.gangDevices],
    ["cables", draft.cables],
    ["conductors", draft.conductors],
  ];
  for (const [name, records] of uniqueCollections) {
    const seen = new Set<string>();
    records.forEach((record, index) => {
      if (seen.has(record.id)) {
        context.addIssue({
          code: "custom",
          path: [name, index, "id"],
          message: `Duplicate ${name} identifier.`,
        });
      }
      seen.add(record.id);
    });
  }
  const cableIds = new Set(draft.cables.map((cable) => cable.id));
  draft.conductors.forEach((conductor, index) => {
    if (conductor.cableId && !cableIds.has(conductor.cableId)) {
      context.addIssue({
        code: "custom",
        path: ["conductors", index, "cableId"],
        message: "A conductor's parent cable must be present in the capture.",
      });
    }
  });
  const occupied = new Set<number>();
  draft.gangDevices.forEach((device, index) => {
    if (device.gangIndex == null) return;
    const span = device.gangSpan ?? 1;
    if (draft.box.gangCount != null && device.gangIndex + span - 1 > draft.box.gangCount) {
      context.addIssue({ code: "custom", path: ["gangDevices", index, "gangSpan"], message: "The mounted device extends beyond the gang box." });
    }
    for (let gang = device.gangIndex; gang < device.gangIndex + span; gang += 1) {
      if (occupied.has(gang)) {
        context.addIssue({ code: "custom", path: ["gangDevices", index, "gangIndex"], message: `Gang ${gang} is occupied more than once.` });
      }
      occupied.add(gang);
    }
  });
});

export type CaptureDraftPayload = z.infer<typeof captureDraftPayloadSchema>;
type CaptureStatus = (typeof s.captureDraftStatuses)[number];
type CaptureDraftRow = typeof s.captureDrafts.$inferSelect;

export type CaptureMutationContext = {
  identity: RequestIdentity;
  propertyId: string;
  requestId: string;
};

export type SaveCaptureDraftInput = {
  status?: Extract<CaptureStatus, "in_progress" | "abandoned">;
  currentStep?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  payload: CaptureDraftPayload;
};

export type CaptureMaterialization = {
  boxAssetId: string;
  boxPermanentCode: string;
  deviceAssetIds: string[];
  cableAssetIds: string[];
  conductorIds: string[];
  status: Extract<CaptureStatus, "ready_for_review" | "completed">;
};

function knowledge(value: z.infer<typeof knowledgeSchema>): (typeof s.knowledgeStates)[number] {
  if (value === "observed") return "visually_observed";
  if (value === "test-verified") return "test_verified";
  return value;
}

function details(value: unknown): string {
  return JSON.stringify(value);
}

function parseEventDetails(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function findReplay(
  propertyId: string,
  requestId: string,
  operation: "create" | "save" | "finish",
  expectedDraftId?: string,
): Promise<CaptureDraftRow | null> {
  const db = getDb();
  if (expectedDraftId) {
    const row = await db.query.captureDrafts.findFirst({
      where: and(
        eq(s.captureDrafts.propertyId, propertyId),
        eq(s.captureDrafts.id, expectedDraftId),
        eq(s.captureDrafts.lastRequestId, requestId),
      ),
    });
    if (row) {
      if (operation === "save" && (row.status === "in_progress" || row.status === "abandoned")) return row;
      if (operation === "finish" && (row.status === "completed" || row.status === "ready_for_review")) {
        const event = await db.query.changeEvents.findFirst({
          where: and(
            eq(s.changeEvents.propertyId, propertyId),
            eq(s.changeEvents.entityType, "capture_draft"),
            eq(s.changeEvents.entityId, expectedDraftId),
            eq(s.changeEvents.requestId, requestId),
          ),
        });
        if (event) return row;
      }
    }
  }
  const event = await db.query.changeEvents.findFirst({
    where: and(
      eq(s.changeEvents.propertyId, propertyId),
      eq(s.changeEvents.requestId, requestId),
    ),
  });
  if (!event) return null;
  const eventDetails = parseEventDetails(event.detailsJson);
  const draftId = typeof eventDetails.captureDraftId === "string"
    ? eventDetails.captureDraftId
    : event.entityType === "capture_draft" ? event.entityId : null;
  if (
    event.entityType !== "capture_draft" ||
    eventDetails.operation !== operation ||
    !draftId ||
    (expectedDraftId && draftId !== expectedDraftId)
  ) {
    throw new ConflictError("This request identifier was already used for a different change.");
  }
  const row = await db.query.captureDrafts.findFirst({
    where: and(
      eq(s.captureDrafts.propertyId, propertyId),
      eq(s.captureDrafts.id, draftId),
    ),
  });
  if (!row) throw new ConflictError("The earlier request cannot be replayed because its draft is unavailable.");
  return row;
}

async function captureRow(
  identity: RequestIdentity,
  propertyId: string,
  id: string,
): Promise<CaptureDraftRow> {
  await requireOwnedProperty(identity, propertyId);
  const row = await getDb().query.captureDrafts.findFirst({
    where: and(eq(s.captureDrafts.propertyId, propertyId), eq(s.captureDrafts.id, id)),
  });
  if (!row) throw new NotFoundError("Capture draft not found.");
  return row;
}

export async function listCaptureDrafts(identity: RequestIdentity, propertyId: string) {
  await requireOwnedProperty(identity, propertyId);
  return getDb().select().from(s.captureDrafts)
    .where(eq(s.captureDrafts.propertyId, propertyId))
    .orderBy(desc(s.captureDrafts.updatedAt), desc(s.captureDrafts.id));
}

export async function getCaptureDraft(identity: RequestIdentity, propertyId: string, id: string) {
  return captureRow(identity, propertyId, id);
}

export async function createCaptureDraft(
  context: CaptureMutationContext,
  input: SaveCaptureDraftInput,
): Promise<CaptureDraftRow> {
  await requireOwnedProperty(context.identity, context.propertyId);
  if (input.payload.propertyId !== context.propertyId) {
    throw new InvalidRequestError("The capture payload belongs to a different property.");
  }
  const replay = await findReplay(context.propertyId, context.requestId, "create");
  if (replay) return replay;
  const db = getDb();
  const id = crypto.randomUUID();
  const storedPayload = { ...input.payload, id };
  const insert = db.insert(s.captureDrafts).values({
    id,
    propertyId: context.propertyId,
    status: input.status ?? "in_progress",
    currentStep: input.currentStep ?? "photos",
    targetType: input.targetType ?? "box",
    targetId: input.targetId ?? null,
    payloadJson: JSON.stringify(storedPayload),
    lastRequestId: context.requestId,
  });
  const event = db.insert(s.changeEvents).values({
    id: crypto.randomUUID(),
    propertyId: context.propertyId,
    actorSubject: context.identity.externalUserId,
    eventKind: "create",
    entityType: "capture_draft",
    entityId: id,
    entityRevision: 1,
    requestId: context.requestId,
    summary: "create capture draft",
    detailsJson: details({ operation: "create", captureDraftId: id }),
  });
  const revise = db.update(s.propertyRevisions).set({
    dataRevision: sql`${s.propertyRevisions.dataRevision} + 1`,
    updatedAt: sql`CURRENT_TIMESTAMP`,
  }).where(eq(s.propertyRevisions.propertyId, context.propertyId));
  try {
    runStatementsAtomically([insert, event, revise]);
  } catch (error) {
    const concurrentReplay = await findReplay(context.propertyId, context.requestId, "create");
    if (concurrentReplay) return concurrentReplay;
    throw error;
  }
  return captureRow(context.identity, context.propertyId, id);
}

export async function saveCaptureDraft(
  context: CaptureMutationContext,
  id: string,
  revision: number,
  input: SaveCaptureDraftInput,
): Promise<CaptureDraftRow> {
  if (input.payload.propertyId !== context.propertyId) {
    throw new InvalidRequestError("The capture payload belongs to a different property.");
  }
  const replay = await findReplay(context.propertyId, context.requestId, "save", id);
  if (replay) return replay;
  const current = await captureRow(context.identity, context.propertyId, id);
  if (current.status === "completed" || current.status === "ready_for_review") {
    throw new ConflictError("A finished capture cannot be edited.");
  }
  if (current.revision !== revision) {
    throw new ConflictError("This capture changed after it was loaded.");
  }
  const db = getDb();
  const result = await db.update(s.captureDrafts).set({
    status: input.status ?? "in_progress",
    currentStep: input.currentStep ?? current.currentStep,
    targetType: input.targetType ?? current.targetType,
    targetId: input.targetId === undefined ? current.targetId : input.targetId,
    payloadJson: JSON.stringify(input.payload),
    lastRequestId: context.requestId,
    revision: sql`${s.captureDrafts.revision} + 1`,
    updatedAt: sql`CURRENT_TIMESTAMP`,
  }).where(and(
    eq(s.captureDrafts.propertyId, context.propertyId),
    eq(s.captureDrafts.id, id),
    eq(s.captureDrafts.revision, revision),
  ));
  if (result.changes !== 1) {
    const concurrentReplay = await findReplay(context.propertyId, context.requestId, "save", id);
    if (concurrentReplay) return concurrentReplay;
    throw new ConflictError("This capture changed after it was loaded.");
  }
  // lastRequestId is the authoritative idempotency marker for draft saves. A
  // missing audit row after an interruption does not make a replay unsafe.
  try {
    runStatementsAtomically([
      db.insert(s.changeEvents).values({
        id: crypto.randomUUID(),
        propertyId: context.propertyId,
        actorSubject: context.identity.externalUserId,
        eventKind: "update",
        entityType: "capture_draft",
        entityId: id,
        entityRevision: revision + 1,
        requestId: context.requestId,
        summary: "save capture draft",
        detailsJson: details({ operation: "save", captureDraftId: id }),
      }),
      db.update(s.propertyRevisions).set({
        dataRevision: sql`${s.propertyRevisions.dataRevision} + 1`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }).where(eq(s.propertyRevisions.propertyId, context.propertyId)),
    ]);
  } catch (error) {
    if (!String(error).toLowerCase().includes("unique")) throw error;
  }
  return captureRow(context.identity, context.propertyId, id);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Stable IDs make concurrent/retried finish batches collide instead of duplicate. */
export async function stableCaptureUuid(draftId: string, ...parts: string[]): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(["circuit-atlas-capture-v1", draftId, ...parts].join("\u001f")),
  ));
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const value = hex(digest.subarray(0, 16));
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function boxKind(value: string | null | undefined): (typeof s.boxKinds)[number] {
  const normalized = value?.trim().toLowerCase();
  return s.boxKinds.includes(normalized as (typeof s.boxKinds)[number])
    ? normalized as (typeof s.boxKinds)[number]
    : normalized ? "other" : "unknown";
}

function boxOrientation(value: CaptureDraftPayload["box"]["orientation"]): (typeof s.boxOrientations)[number] {
  if (value === "wall-finished-side") return "portrait";
  if (value === "ceiling-from-below") return "square";
  if (value === "other") return "custom";
  return "unknown";
}

function wiringMethod(value: CaptureDraftPayload["cables"][number]["wiringMethod"]): (typeof s.wiringMethods)[number] {
  if (value === "nm-b") return "NM-B";
  if (value === "uf-b") return "UF-B";
  if (value === "mc") return "MC";
  return value;
}

function conductorKind(value: CaptureDraftPayload["conductors"][number]["kind"]): (typeof s.conductorKinds)[number] {
  const mapping: Record<typeof value, (typeof s.conductorKinds)[number]> = {
    "cable-core": "cable_core",
    "equipment-ground": "cable_equipment_ground",
    pigtail: "pigtail",
    jumper: "jumper",
    "device-lead": "device_lead",
    standalone: "standalone_raceway",
    unknown: "unknown",
  };
  return mapping[value];
}

function conductorRole(value: string | null | undefined): {
  role: (typeof s.conductorRoles)[number] | null;
  raw: string | null;
} {
  const normalized = value?.trim().toLowerCase().replaceAll(/[\s-]+/g, "_") ?? "";
  if (!normalized) return { role: null, raw: null };
  if (s.conductorRoles.includes(normalized as (typeof s.conductorRoles)[number])) {
    return { role: normalized as (typeof s.conductorRoles)[number], raw: null };
  }
  return { role: "custom", raw: value?.trim() ?? null };
}

function deviceValues(device: CaptureDraftPayload["gangDevices"][number]) {
  const deviceKind: (typeof s.deviceKinds)[number] =
    device.smartState === "smart-companion" ? "smart_companion"
      : device.smartState === "wireless-remote" ? "wireless_controller"
        : device.kind === "switch" ? "switch"
          : device.kind === "receptacle" ? "receptacle" : "custom";
  const smartState: (typeof s.smartStates)[number] =
    device.smartState === "dumb" ? "dumb"
      : device.smartState === "unknown" ? "unknown" : "smart";
  return { deviceKind, smartState };
}

function needsReview(draft: CaptureDraftPayload): boolean {
  return draft.needsReview || !draft.photos.length || draft.box.gangCount == null ||
    !draft.gangDevices.length || !draft.cables.length ||
    draft.cables.some((cable) => cable.entrySide === "unknown") ||
    draft.conductors.some((conductor) => conductor.ends.some((end) => end.terminationType === "unknown"));
}

type MaterializationCodebook = {
  box: string;
  devices: Map<string, string>;
  cables: Map<string, string>;
  conductors: Map<string, string>;
};

export type CaptureMaterializationRows = {
  boxAssetId: string;
  boxAsset: typeof s.assets.$inferInsert | null;
  box: typeof s.boxes.$inferInsert;
  deviceAssets: Array<typeof s.assets.$inferInsert>;
  devices: Array<typeof s.devices.$inferInsert>;
  mounts: Array<typeof s.assetMounts.$inferInsert>;
  mountPositions: Array<typeof s.assetMountPositions.$inferInsert>;
  cableAssets: Array<typeof s.assets.$inferInsert>;
  cables: Array<typeof s.cables.$inferInsert>;
  ports: Array<typeof s.boxPorts.$inferInsert>;
  cableEnds: Array<typeof s.cableEnds.$inferInsert>;
  conductors: Array<typeof s.conductors.$inferInsert>;
  nodes: Array<typeof s.electricalNodes.$inferInsert>;
  terminals: Array<typeof s.terminals.$inferInsert>;
  splices: Array<typeof s.splices.$inferInsert>;
  openEndpoints: Array<typeof s.openEndpoints.$inferInsert>;
  bondPoints: Array<typeof s.bondPoints.$inferInsert>;
  conductorEnds: Array<typeof s.conductorEnds.$inferInsert>;
  materialization: CaptureMaterialization;
};

/** Pure mapping apart from its injected stable-ID function; exported for tests. */
export async function buildCaptureMaterializationRows(input: {
  propertyId: string;
  draftId: string;
  draft: CaptureDraftPayload;
  existingBoxAssetId?: string | null;
  codes: MaterializationCodebook;
  idFactory?: (kind: string, localId: string) => Promise<string>;
}): Promise<CaptureMaterializationRows> {
  const { propertyId, draftId, draft, codes } = input;
  const idFor = input.idFactory ?? ((kind: string, localId: string) => stableCaptureUuid(draftId, kind, localId));
  const boxAssetId = input.existingBoxAssetId ?? await idFor("asset", "box");
  const boxCode = codes.box;
  const boxMetadata = {
    captureDraftId: draftId,
    notes: draft.notes || null,
    unknowns: {
      gangCount: draft.box.gangCount == null,
      type: !draft.box.type,
      orientation: draft.box.orientation === "unknown",
      rawDepthOrDimensions: draft.box.depth ?? null,
    },
  };
  const boxAsset = input.existingBoxAssetId ? null : {
    id: boxAssetId,
    propertyId,
    permanentCode: boxCode,
    kind: "box" as const,
    displayName: draft.box.displayName || draft.targetLabel,
    notes: details(boxMetadata),
  };
  const box: typeof s.boxes.$inferInsert = {
    assetId: boxAssetId,
    propertyId,
    boxKind: boxKind(draft.box.type),
    material: draft.box.material,
    gangCount: draft.box.gangCount ?? 1,
    orientation: boxOrientation(draft.box.orientation),
  };

  const deviceAssets: CaptureMaterializationRows["deviceAssets"] = [];
  const devices: CaptureMaterializationRows["devices"] = [];
  const mounts: CaptureMaterializationRows["mounts"] = [];
  const mountPositions: CaptureMaterializationRows["mountPositions"] = [];
  const deviceIds = new Map<string, string>();
  for (const device of draft.gangDevices) {
    const assetId = device.assetId ?? await idFor("device", device.id);
    deviceIds.set(device.id, assetId);
    if (!device.assetId) {
      deviceAssets.push({
        id: assetId,
        propertyId,
        permanentCode: codes.devices.get(device.id)!,
        kind: "device",
        displayName: device.displayName,
        notes: details({ captureDraftId: draftId, kindUnknown: device.kind === "unknown", gangPositionUnknown: device.gangIndex == null }),
      });
      const values = deviceValues(device);
      devices.push({ assetId, propertyId, ...values, configurationLabel: device.configuration ?? null });
    }
    if (device.gangIndex != null) {
      const mountId = await idFor("mount", device.id);
      const span = device.gangSpan ?? 1;
      mounts.push({
        id: mountId,
        propertyId,
        boxAssetId,
        mountedAssetId: assetId,
        startGangIndex: device.gangIndex,
        gangSpan: span,
        rotationDegrees: device.rotation ?? 0,
        faceLabel: device.displayName,
      });
      for (let gang = device.gangIndex; gang < device.gangIndex + span; gang += 1) {
        mountPositions.push({ propertyId, mountId, boxAssetId, gangIndex: gang });
      }
    }
  }

  const cableAssets: CaptureMaterializationRows["cableAssets"] = [];
  const cables: CaptureMaterializationRows["cables"] = [];
  const ports: CaptureMaterializationRows["ports"] = [];
  const cableEnds: CaptureMaterializationRows["cableEnds"] = [];
  const cableIds = new Map<string, string>();
  for (const cable of draft.cables) {
    const assetId = await idFor("cable", cable.id);
    cableIds.set(cable.id, assetId);
    cableAssets.push({
      id: assetId,
      propertyId,
      permanentCode: codes.cables.get(cable.id)!,
      kind: "cable",
      displayName: cable.permanentCode || `Cable entering ${draft.box.displayName || draft.targetLabel}`,
      notes: details({ captureDraftId: draftId }),
    });
    cables.push({
      assetId,
      propertyId,
      wiringMethod: wiringMethod(cable.wiringMethod),
      customWiringMethod: cable.wiringMethod === "custom" ? "Unspecified custom wiring method" : null,
      jacketMarking: cable.rawJacketMarking ?? null,
      insulatedConductorCount: cable.insulatedConductorCount,
      equipmentGroundCount: cable.equipmentGroundCount,
      gauge: cable.gauge ?? null,
      notes: details({
        captureDraftId: draftId,
        insulatedConductorCountUnknown: cable.insulatedConductorCount == null,
        equipmentGroundCountUnknown: cable.equipmentGroundCount == null,
      }),
    });
    const boxDesignation = cable.endDesignation === "b" ? "B" : "A";
    const otherDesignation = boxDesignation === "A" ? "B" : "A";
    let boxPortId: string | null = null;
    if (cable.entrySide !== "unknown") {
      boxPortId = await idFor("port", cable.id);
      ports.push({
        id: boxPortId,
        propertyId,
        boxAssetId,
        side: cable.entrySide,
        offsetNormalized: (cable.entryOffset ?? 50) / 100,
        notes: cable.entryOffset == null ? details({ offsetUnknown: true }) : null,
      });
    }
    cableEnds.push(
      {
        id: await idFor("cable-end", `${cable.id}:${boxDesignation}`),
        propertyId,
        cableAssetId: assetId,
        designation: boxDesignation,
        boxAssetId,
        boxPortId,
        certainty: knowledge(cable.certainty),
        notes: cable.endDesignation === "unknown" ? details({ originalDesignation: "unknown", entrySide: cable.entrySide }) : null,
      },
      {
        id: await idFor("cable-end", `${cable.id}:${otherDesignation}`),
        propertyId,
        cableAssetId: assetId,
        designation: otherDesignation,
        certainty: cable.otherEndpointLabel ? knowledge(cable.certainty) : "unknown",
        notes: details({ endpointLabel: cable.otherEndpointLabel ?? null, unresolved: true }),
      },
    );
  }

  const conductors: CaptureMaterializationRows["conductors"] = [];
  const nodes: CaptureMaterializationRows["nodes"] = [];
  const terminals: CaptureMaterializationRows["terminals"] = [];
  const splices: CaptureMaterializationRows["splices"] = [];
  const openEndpoints: CaptureMaterializationRows["openEndpoints"] = [];
  const bondPoints: CaptureMaterializationRows["bondPoints"] = [];
  const conductorEnds: CaptureMaterializationRows["conductorEnds"] = [];
  const conductorIds: string[] = [];
  const coreIndexes = new Map<string, number>();
  const sharedNodes = new Map<string, string>();
  for (const conductor of draft.conductors) {
    const conductorId = await idFor("conductor", conductor.id);
    conductorIds.push(conductorId);
    const parentCableId = conductor.cableId ? cableIds.get(conductor.cableId) ?? null : null;
    const role = conductorRole(conductor.role);
    let coreIndex: number | null = null;
    if (parentCableId && conductor.kind === "cable-core") {
      coreIndex = (coreIndexes.get(parentCableId) ?? 0) + 1;
      coreIndexes.set(parentCableId, coreIndex);
    }
    conductors.push({
      id: conductorId,
      propertyId,
      permanentCode: codes.conductors.get(conductor.id)!,
      cableAssetId: parentCableId,
      kind: conductorKind(conductor.kind),
      coreIndex,
      observedInsulationColor: conductor.observedColor ?? null,
      reidentificationMarking: conductor.reidentification ?? null,
      gauge: conductor.gauge ?? null,
      observedRole: role.role,
      notes: details({ captureDraftId: draftId, rawRole: role.raw }),
    });
    for (const end of conductor.ends) {
      const sharedLabel = end.terminationLabel?.trim().toLocaleLowerCase();
      const mayShare = end.terminationType === "splice" || end.terminationType === "bond";
      const sharedKey = mayShare && sharedLabel ? `${end.terminationType}:${sharedLabel}` : null;
      let nodeId = sharedKey ? sharedNodes.get(sharedKey) : undefined;
      if (!nodeId) {
        nodeId = await idFor("node", sharedKey ?? `${conductor.id}:${end.designation}`);
        if (sharedKey) sharedNodes.set(sharedKey, nodeId);
        const nodeKind: (typeof s.electricalNodeKinds)[number] =
          end.terminationType === "terminal" ? "terminal"
            : end.terminationType === "splice" ? "splice"
              : end.terminationType === "bond" ? "bond_point" : "open_endpoint";
        nodes.push({
          id: nodeId,
          propertyId,
          kind: nodeKind,
          containingBoxAssetId: boxAssetId,
          containingAssetId: end.terminationType === "terminal" ? boxAssetId : null,
          label: end.terminationLabel ?? end.destinationLabel ?? (end.terminationType === "unknown" ? "Unresolved endpoint" : null),
          certainty: knowledge(end.certainty),
          notes: details({ destinationLabel: end.destinationLabel ?? null, originalTerminationType: end.terminationType }),
        });
        if (end.terminationType === "terminal") {
          terminals.push({
            electricalNodeId: nodeId,
            propertyId,
            owningAssetId: boxAssetId,
            terminalKey: `capture:${conductor.id}:${end.designation}`,
            manufacturerLabel: end.terminationLabel ?? null,
            semanticRole: "UNKNOWN",
            notes: details({ owningDeviceUnknown: true, destinationLabel: end.destinationLabel ?? null }),
          });
        } else if (end.terminationType === "splice") {
          splices.push({ electricalNodeId: nodeId, propertyId, boxAssetId, label: end.terminationLabel ?? null });
        } else if (end.terminationType === "bond") {
          bondPoints.push({ electricalNodeId: nodeId, propertyId, boxAssetId, description: end.terminationLabel ?? end.destinationLabel ?? null });
        } else {
          openEndpoints.push({
            electricalNodeId: nodeId,
            propertyId,
            endpointKind: end.terminationType === "cap-open" ? "capped" : "unknown",
            description: end.terminationLabel ?? end.destinationLabel ?? null,
          });
        }
      }
      conductorEnds.push({
        id: await idFor("conductor-end", `${conductor.id}:${end.designation}`),
        propertyId,
        conductorId,
        designation: end.designation.toUpperCase() as "A" | "B",
        electricalNodeId: nodeId,
        terminationMethod: end.terminationType === "cap-open" ? "open" : "unknown",
        certainty: knowledge(end.certainty),
        notes: end.destinationLabel ? details({ destinationLabel: end.destinationLabel }) : null,
      });
    }
  }

  const status = needsReview(draft) ? "ready_for_review" : "completed";
  return {
    boxAssetId,
    boxAsset,
    box,
    deviceAssets,
    devices,
    mounts,
    mountPositions,
    cableAssets,
    cables,
    ports,
    cableEnds,
    conductors,
    nodes,
    terminals,
    splices,
    openEndpoints,
    bondPoints,
    conductorEnds,
    materialization: {
      boxAssetId,
      boxPermanentCode: boxCode,
      deviceAssetIds: draft.gangDevices.map((device) => deviceIds.get(device.id)!),
      cableAssetIds: draft.cables.map((cable) => cableIds.get(cable.id)!),
      conductorIds,
      status,
    },
  };
}

async function reserveCodes(
  identity: RequestIdentity,
  propertyId: string,
  draft: CaptureDraftPayload,
  existingBoxCode?: string | null,
): Promise<MaterializationCodebook> {
  const devices = new Map<string, string>();
  const cables = new Map<string, string>();
  const conductors = new Map<string, string>();
  for (const device of draft.gangDevices) {
    if (!device.assetId) devices.set(device.id, await nextPropertyCode(identity, propertyId, "DEV"));
  }
  for (const cable of draft.cables) {
    cables.set(cable.id, cable.permanentCode || await nextPropertyCode(identity, propertyId, "CBL"));
  }
  for (const conductor of draft.conductors) {
    conductors.set(conductor.id, conductor.permanentCode || await nextPropertyCode(identity, propertyId, "WIR"));
  }
  return {
    box: existingBoxCode || draft.box.permanentCode || await nextPropertyCode(identity, propertyId, "BOX"),
    devices,
    cables,
    conductors,
  };
}

function pushInsert<T extends AtomicStatement>(
  statements: AtomicStatement[],
  statement: T,
) {
  statements.push(statement);
}

export async function finishCaptureDraft(
  context: CaptureMutationContext,
  id: string,
  revision: number,
): Promise<{ item: CaptureDraftRow; materialization: CaptureMaterialization }> {
  const replay = await findReplay(context.propertyId, context.requestId, "finish", id);
  if (replay) {
    const event = await getDb().query.changeEvents.findFirst({ where: and(eq(s.changeEvents.propertyId, context.propertyId), eq(s.changeEvents.requestId, context.requestId)) });
    const materialization = parseEventDetails(event?.detailsJson ?? "{}").materialization as CaptureMaterialization | undefined;
    if (!materialization) throw new ConflictError("The completed capture result is unavailable.");
    return { item: replay, materialization };
  }
  const row = await captureRow(context.identity, context.propertyId, id);
  if (row.status === "completed" || row.status === "ready_for_review") {
    const event = await getDb().query.changeEvents.findFirst({
      where: and(eq(s.changeEvents.propertyId, context.propertyId), eq(s.changeEvents.entityType, "capture_draft"), eq(s.changeEvents.entityId, id)),
      orderBy: [desc(s.changeEvents.createdAt), desc(s.changeEvents.id)],
    });
    const materialization = parseEventDetails(event?.detailsJson ?? "{}").materialization as CaptureMaterialization | undefined;
    if (materialization) return { item: row, materialization };
    throw new ConflictError("This capture is already finished.");
  }
  if (row.revision !== revision) throw new ConflictError("This capture changed after it was loaded.");
  const parsed = captureDraftPayloadSchema.safeParse(JSON.parse(row.payloadJson) as unknown);
  if (!parsed.success) throw new InvalidRequestError(`The capture draft is incomplete: ${parsed.error.issues[0]?.message ?? "invalid payload"}`);
  const draft = parsed.data;
  if (draft.propertyId !== context.propertyId) throw new InvalidRequestError("The capture payload belongs to a different property.");
  const db = getDb();
  const targetId = row.targetId ?? draft.targetId ?? draft.box.assetId ?? null;
  let existingBoxCode: string | null = null;
  if (targetId) {
    const target = await db.query.assets.findFirst({ where: and(eq(s.assets.propertyId, context.propertyId), eq(s.assets.id, targetId), eq(s.assets.lifecycleState, "active")) });
    const targetBox = await db.query.boxes.findFirst({ where: and(eq(s.boxes.propertyId, context.propertyId), eq(s.boxes.assetId, targetId)) });
    if (!target || !targetBox || target.kind !== "box") throw new InvalidRequestError("The capture target is not an active box in this property.");
    existingBoxCode = target.permanentCode;
  }
  if (draft.locationId) {
    const space = await db.query.spaces.findFirst({ where: and(eq(s.spaces.propertyId, context.propertyId), eq(s.spaces.id, draft.locationId), eq(s.spaces.lifecycleState, "active")) });
    if (!space) throw new InvalidRequestError("The capture location is not in this property.");
  }
  for (const device of draft.gangDevices) {
    if (!device.assetId) continue;
    const [asset, detail] = await Promise.all([
      db.query.assets.findFirst({ where: and(eq(s.assets.propertyId, context.propertyId), eq(s.assets.id, device.assetId), eq(s.assets.lifecycleState, "active")) }),
      db.query.devices.findFirst({ where: and(eq(s.devices.propertyId, context.propertyId), eq(s.devices.assetId, device.assetId)) }),
    ]);
    if (!asset || !detail || asset.kind !== "device") throw new InvalidRequestError("A captured mounted device is not an active device in this property.");
  }
  const codes = await reserveCodes(context.identity, context.propertyId, draft, existingBoxCode);
  const rows = await buildCaptureMaterializationRows({ propertyId: context.propertyId, draftId: id, draft, existingBoxAssetId: targetId, codes });
  const statements: AtomicStatement[] = [];
  // SQLite treats an UPDATE matching zero rows as successful. This first
  // SELECT deliberately raises a JSON1 error if
  // the optimistic revision/status predicate no longer holds, rolling back all
  // following parent and child inserts.
  pushInsert(statements, db.select({
    commitGuard: sql<number>`CASE WHEN EXISTS (
      SELECT 1 FROM ${s.captureDrafts}
      WHERE ${s.captureDrafts.propertyId} = ${context.propertyId}
        AND ${s.captureDrafts.id} = ${id}
        AND ${s.captureDrafts.revision} = ${revision}
        AND ${s.captureDrafts.status} = 'in_progress'
    ) THEN 1 ELSE json('') END`,
  }).from(s.captureDrafts).limit(1));
  if (rows.boxAsset) {
    pushInsert(statements, db.insert(s.assets).values(rows.boxAsset));
    pushInsert(statements, db.insert(s.boxes).values(rows.box));
  } else {
    const boxPatch: Partial<typeof s.boxes.$inferInsert> = {};
    if (draft.box.type) boxPatch.boxKind = rows.box.boxKind;
    if (draft.box.material !== "unknown") boxPatch.material = rows.box.material;
    if (draft.box.gangCount != null) boxPatch.gangCount = rows.box.gangCount;
    if (draft.box.orientation !== "unknown") boxPatch.orientation = rows.box.orientation;
    if (Object.keys(boxPatch).length) pushInsert(statements, db.update(s.boxes).set(boxPatch).where(and(eq(s.boxes.propertyId, context.propertyId), eq(s.boxes.assetId, rows.boxAssetId))));
    if (draft.box.displayName) pushInsert(statements, db.update(s.assets).set({ displayName: draft.box.displayName, revision: sql`${s.assets.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(s.assets.propertyId, context.propertyId), eq(s.assets.id, rows.boxAssetId))));
  }
  if (draft.locationId) {
    const existingLocation = await db.query.assetLocations.findFirst({ where: and(eq(s.assetLocations.propertyId, context.propertyId), eq(s.assetLocations.assetId, rows.boxAssetId)) });
    if (existingLocation) {
      pushInsert(statements, db.update(s.assetLocations).set({ spaceId: draft.locationId, locatorLabel: draft.locationLabel ?? null, certainty: "visually_observed", revision: sql`${s.assetLocations.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(s.assetLocations.propertyId, context.propertyId), eq(s.assetLocations.id, existingLocation.id))));
    } else {
      pushInsert(statements, db.insert(s.assetLocations).values({ id: await stableCaptureUuid(id, "location", "box"), propertyId: context.propertyId, assetId: rows.boxAssetId, spaceId: draft.locationId, locatorLabel: draft.locationLabel ?? null, certainty: "visually_observed" }));
    }
  }
  if (rows.deviceAssets.length) pushInsert(statements, db.insert(s.assets).values(rows.deviceAssets));
  if (rows.devices.length) pushInsert(statements, db.insert(s.devices).values(rows.devices));
  for (const device of draft.gangDevices) {
    if (!device.assetId) continue;
    const values = deviceValues(device);
    pushInsert(statements, db.update(s.assets).set({ displayName: device.displayName, revision: sql`${s.assets.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(s.assets.propertyId, context.propertyId), eq(s.assets.id, device.assetId))));
    pushInsert(statements, db.update(s.devices).set({ ...values, configurationLabel: device.configuration ?? null }).where(and(eq(s.devices.propertyId, context.propertyId), eq(s.devices.assetId, device.assetId))));
  }
  for (const mount of rows.mounts) {
    const existing = await db.query.assetMounts.findFirst({ where: and(eq(s.assetMounts.propertyId, context.propertyId), eq(s.assetMounts.mountedAssetId, mount.mountedAssetId)) });
    if (existing) {
      pushInsert(statements, db.delete(s.assetMountPositions).where(and(eq(s.assetMountPositions.propertyId, context.propertyId), eq(s.assetMountPositions.mountId, existing.id))));
      pushInsert(statements, db.update(s.assetMounts).set({ boxAssetId: mount.boxAssetId, startGangIndex: mount.startGangIndex, gangSpan: mount.gangSpan, rotationDegrees: mount.rotationDegrees, faceLabel: mount.faceLabel, revision: sql`${s.assetMounts.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(s.assetMounts.propertyId, context.propertyId), eq(s.assetMounts.id, existing.id))));
      rows.mountPositions.filter((position) => position.mountId === mount.id).forEach((position) => pushInsert(statements, db.insert(s.assetMountPositions).values({ ...position, mountId: existing.id })));
    } else {
      pushInsert(statements, db.insert(s.assetMounts).values(mount));
      const positions = rows.mountPositions.filter((position) => position.mountId === mount.id);
      if (positions.length) pushInsert(statements, db.insert(s.assetMountPositions).values(positions));
    }
  }
  if (rows.cableAssets.length) pushInsert(statements, db.insert(s.assets).values(rows.cableAssets));
  if (rows.cables.length) pushInsert(statements, db.insert(s.cables).values(rows.cables));
  if (rows.ports.length) pushInsert(statements, db.insert(s.boxPorts).values(rows.ports));
  if (rows.cableEnds.length) pushInsert(statements, db.insert(s.cableEnds).values(rows.cableEnds));
  if (rows.conductors.length) pushInsert(statements, db.insert(s.conductors).values(rows.conductors));
  if (rows.nodes.length) pushInsert(statements, db.insert(s.electricalNodes).values(rows.nodes));
  if (rows.terminals.length) pushInsert(statements, db.insert(s.terminals).values(rows.terminals));
  if (rows.splices.length) pushInsert(statements, db.insert(s.splices).values(rows.splices));
  if (rows.openEndpoints.length) pushInsert(statements, db.insert(s.openEndpoints).values(rows.openEndpoints));
  if (rows.bondPoints.length) pushInsert(statements, db.insert(s.bondPoints).values(rows.bondPoints));
  if (rows.conductorEnds.length) pushInsert(statements, db.insert(s.conductorEnds).values(rows.conductorEnds));
  pushInsert(statements, db.update(s.attachments).set({ ownerType: "asset", ownerId: rows.boxAssetId, revision: sql`${s.attachments.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(s.attachments.propertyId, context.propertyId), eq(s.attachments.ownerType, "capture_draft"), eq(s.attachments.ownerId, id), eq(s.attachments.lifecycleState, "active"))));
  pushInsert(statements, db.update(s.captureDrafts).set({
    status: rows.materialization.status,
    currentStep: "review",
    targetType: "box",
    targetId: rows.boxAssetId,
    lastRequestId: context.requestId,
    revision: sql`${s.captureDrafts.revision} + 1`,
    updatedAt: sql`CURRENT_TIMESTAMP`,
  }).where(and(eq(s.captureDrafts.propertyId, context.propertyId), eq(s.captureDrafts.id, id), eq(s.captureDrafts.revision, revision), eq(s.captureDrafts.status, "in_progress"))));
  pushInsert(statements, db.update(s.propertyRevisions).set({ dataRevision: sql`${s.propertyRevisions.dataRevision} + 1`, topologyRevision: sql`${s.propertyRevisions.topologyRevision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(s.propertyRevisions.propertyId, context.propertyId)));
  pushInsert(statements, db.insert(s.changeEvents).values({
    id: await stableCaptureUuid(id, "event", "finish"),
    propertyId: context.propertyId,
    actorSubject: context.identity.externalUserId,
    eventKind: "create",
    entityType: "capture_draft",
    entityId: id,
    entityRevision: revision + 1,
    requestId: context.requestId,
    summary: "finish capture and materialize electrical records",
    detailsJson: details({ operation: "finish", captureDraftId: id, materialization: rows.materialization }),
  }));
  if (!statements.length) throw new Error("The capture produced no database statements.");
  try {
    runStatementsAtomically(statements);
  } catch (error) {
    const latest = await captureRow(context.identity, context.propertyId, id);
    if (
      latest.lastRequestId === context.requestId &&
      (latest.status === "completed" || latest.status === "ready_for_review")
    ) {
      const event = await db.query.changeEvents.findFirst({
        where: and(
          eq(s.changeEvents.propertyId, context.propertyId),
          eq(s.changeEvents.entityType, "capture_draft"),
          eq(s.changeEvents.entityId, id),
          eq(s.changeEvents.requestId, context.requestId),
        ),
      });
      const replayed = parseEventDetails(event?.detailsJson ?? "{}").materialization as CaptureMaterialization | undefined;
      if (replayed) return { item: latest, materialization: replayed };
    }
    if (latest.revision !== revision || latest.status !== "in_progress") {
      throw new ConflictError("This capture changed after it was loaded.");
    }
    throw error;
  }
  return { item: await captureRow(context.identity, context.propertyId, id), materialization: rows.materialization };
}
