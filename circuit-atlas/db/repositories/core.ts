import {
  and,
  count,
  eq,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  getDb,
  getSqliteConnection,
  runStatementsAtomically,
  type SqliteRunResult,
} from "@/db";
import * as schema from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import {
  ConflictError,
  InvalidRequestError,
  NotFoundError,
} from "@/lib/http/responses";
import { requireOwnedProperty } from "./workspaces";

type PropertyTable = SQLiteTable & {
  propertyId: typeof schema.assets.propertyId;
};

export type MutationContext = {
  identity: RequestIdentity;
  propertyId: string;
  requestId?: string | null;
};

export const resourceTables = {
  structures: schema.structures,
  levels: schema.levels,
  spaces: schema.spaces,
  "wall-zones": schema.wallZones,
  panels: schema.panels,
  "panel-positions": schema.panelPositions,
  breakers: schema.breakers,
  "breaker-poles": schema.breakerPoles,
  circuits: schema.circuits,
  assets: schema.assets,
  "asset-functions": schema.assetFunctions,
  "asset-locations": schema.assetLocations,
  "installed-products": schema.installedProducts,
  boxes: schema.boxes,
  "box-ports": schema.boxPorts,
  "asset-mounts": schema.assetMounts,
  cables: schema.cables,
  "cable-ends": schema.cableEnds,
  conductors: schema.conductors,
  nodes: schema.electricalNodes,
  terminals: schema.terminals,
  splices: schema.splices,
  "conductor-ends": schema.conductorEnds,
  connections: schema.internalConnections,
  "circuit-sources": schema.circuitSources,
  "control-groups": schema.controlGroups,
  "control-members": schema.controlMembers,
  "control-links": schema.controlLinks,
  assertions: schema.assetCircuitAssertions,
  upgrades: schema.upgradeItems,
  "upgrade-requirements": schema.upgradeRequirements,
  "upgrade-observations": schema.upgradeObservations,
  "proposed-products": schema.proposedProducts,
  placements: schema.planPlacements,
  "capture-drafts": schema.captureDrafts,
} as const;

export type ResourceKind = keyof typeof resourceTables;

const lifecycleKinds = new Set<ResourceKind>([
  "structures",
  "levels",
  "spaces",
  "wall-zones",
  "breakers",
  "circuits",
  "assets",
  "asset-functions",
  "installed-products",
  "conductors",
  "nodes",
  "control-groups",
]);

const topologyKinds = new Set<ResourceKind>([
  "boxes",
  "box-ports",
  "asset-mounts",
  "cables",
  "cable-ends",
  "conductors",
  "nodes",
  "terminals",
  "splices",
  "conductor-ends",
  "connections",
  "circuit-sources",
]);

const idColumnByKind: Partial<Record<ResourceKind, string>> = {
  panels: "assetId",
  boxes: "assetId",
  cables: "assetId",
  terminals: "electricalNodeId",
  splices: "electricalNodeId",
};

const assetSubtypeKinds = new Set<ResourceKind>(["panels", "boxes", "cables"]);

const mutableFields: Record<ResourceKind, ReadonlySet<string>> = {
  structures: new Set(["name", "kind", "notes", "sortOrder", "lifecycleState"]),
  levels: new Set(["name", "elevationOrder", "notes", "lifecycleState"]),
  spaces: new Set(["name", "kind", "notes", "sortOrder", "lifecycleState"]),
  "wall-zones": new Set(["name", "orientation", "notes", "sortOrder", "lifecycleState"]),
  panels: new Set(["role", "nominalVoltage", "phaseCount", "maxAmps", "systemNotes"]),
  "panel-positions": new Set(["label"]),
  breakers: new Set(["label", "ratingAmps", "kind", "hasAfci", "hasGfci", "handleTieGroup", "notes", "lifecycleState"]),
  "breaker-poles": new Set(["phaseLeg", "notes"]),
  circuits: new Set(["name", "nominalVoltage", "purpose", "notes", "lifecycleState"]),
  assets: new Set(["displayName", "notes", "lifecycleState"]),
  "asset-functions": new Set(["displayName", "channelNumber", "notes", "lifecycleState"]),
  "asset-locations": new Set(["structureId", "levelId", "spaceId", "wallZoneId", "locatorLabel", "height", "heightUnit", "certainty", "evidenceId"]),
  "installed-products": new Set(["manufacturer", "model", "sku", "serialNumber", "smartState", "capabilitiesJson", "installedAt", "removedAt", "notes", "lifecycleState"]),
  boxes: new Set(["boxKind", "material", "gangCount", "orientation", "width", "height", "depth", "dimensionUnit"]),
  "box-ports": new Set(["side", "offsetNormalized", "knockoutLabel", "notes"]),
  "asset-mounts": new Set(["startGangIndex", "gangSpan", "verticalPosition", "rotationDegrees", "faceLabel"]),
  cables: new Set(["wiringMethod", "customWiringMethod", "jacketMarking", "insulatedConductorCount", "equipmentGroundCount", "gauge", "notes"]),
  "cable-ends": new Set(["boxAssetId", "endpointAssetId", "boxPortId", "certainty", "notes"]),
  conductors: new Set(["observedInsulationColor", "reidentificationMarking", "gauge", "material", "observedRole", "assignedRole", "notes", "lifecycleState"]),
  nodes: new Set(["containingBoxAssetId", "containingAssetId", "label", "certainty", "notes", "lifecycleState"]),
  terminals: new Set(["manufacturerLabel", "semanticRole", "terminalGroup", "notes"]),
  splices: new Set(["connectorType", "label"]),
  "conductor-ends": new Set(["electricalNodeId", "terminationMethod", "certainty", "notes"]),
  connections: new Set(["fromNodeId", "toNodeId", "connectionType", "contactStateGroup", "contactState", "directionality", "connectionState", "certainty", "notes"]),
  "circuit-sources": new Set(["electricalNodeId", "legRole", "notes"]),
  "control-groups": new Set(["name", "presentationLabel", "notes", "lifecycleState"]),
  "control-members": new Set(["role", "method", "sortOrder", "notes"]),
  "control-links": new Set(["method", "certainty", "notes"]),
  assertions: new Set(["status", "certainty", "evidenceId", "notes"]),
  upgrades: new Set(["status", "goal", "priority", "notes", "completedInstalledProductId"]),
  "upgrade-requirements": new Set(["requirementKind", "customRequirement", "expectedValueJson", "description", "sortOrder"]),
  "upgrade-observations": new Set(["readinessState", "observedValueJson", "certainty", "evidenceId", "notes", "observedAt"]),
  "proposed-products": new Set(["productModelId", "manufacturer", "model", "productUrl", "estimatedCost", "currency", "rank", "selected", "notes"]),
  placements: new Set(["xNormalized", "yNormalized", "rotationDegrees", "wallOffset", "height", "heightUnit"]),
  "capture-drafts": new Set(["status", "currentStep", "targetType", "targetId", "payloadJson", "lastRequestId"]),
};

function tableFor(kind: ResourceKind): PropertyTable {
  return resourceTables[kind] as unknown as PropertyTable;
}

function idColumnFor(kind: ResourceKind): string {
  return idColumnByKind[kind] ?? "id";
}

function columnFor(table: PropertyTable, key: string) {
  const value = (table as unknown as Record<string, unknown>)[key];
  if (!value || typeof value !== "object") {
    throw new InvalidRequestError(`Field ${key} is not valid for this resource.`);
  }
  return value as AnySQLiteColumn;
}

function cleanValues(
  table: PropertyTable,
  values: Record<string, unknown>,
  kind?: ResourceKind,
): Record<string, unknown> {
  const allowed = new Set(Object.keys(table));
  const resourceAllowed = kind ? mutableFields[kind] : undefined;
  const invalid = Object.keys(values).filter(
    (key) =>
      key !== "id" &&
      key !== "propertyId" &&
      key !== "createdAt" &&
      key !== "updatedAt" &&
      key !== "revision" &&
      key !== "requestId" &&
      (!allowed.has(key) || (resourceAllowed ? !resourceAllowed.has(key) : false)),
  );
  if (invalid.length) {
    throw new InvalidRequestError(`Fields are immutable or unknown: ${invalid.join(", ")}.`);
  }
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        key !== "id" &&
        key !== "propertyId" &&
        key !== "permanentCode" &&
        key !== "createdAt" &&
        key !== "updatedAt" &&
        key !== "revision" &&
        allowed.has(key) &&
        (!resourceAllowed || resourceAllowed.has(key)) &&
        value !== undefined,
    ),
  );
}

function cleanCreateValues(
  table: PropertyTable,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set(Object.keys(table));
  const invalid = Object.keys(values).filter(
    (key) =>
      key !== "id" && key !== "propertyId" && key !== "createdAt" &&
      key !== "updatedAt" && key !== "revision" && key !== "requestId" &&
      !allowed.has(key),
  );
  if (invalid.length) {
    throw new InvalidRequestError(`Unknown fields: ${invalid.join(", ")}.`);
  }
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        key !== "id" &&
        key !== "propertyId" &&
        key !== "createdAt" &&
        key !== "updatedAt" &&
        key !== "revision" &&
        key !== "requestId" &&
        allowed.has(key) &&
        value !== undefined,
    ),
  );
}

async function replayedResourceMutation(
  context: MutationContext,
  kind: ResourceKind,
) {
  if (!context.requestId) return null;
  const event = await getDb().query.changeEvents.findFirst({ where: and(
    eq(schema.changeEvents.propertyId, context.propertyId),
    eq(schema.changeEvents.requestId, context.requestId),
  ) });
  if (event && event.entityType !== kind) {
    throw new ConflictError("This request identifier was already used for a different change.");
  }
  return event ?? null;
}

export async function bumpPropertyRevision(
  propertyId: string,
  topology = false,
) {
  const db = getDb();
  const values = topology
    ? {
        dataRevision: sql`${schema.propertyRevisions.dataRevision} + 1`,
        topologyRevision: sql`${schema.propertyRevisions.topologyRevision} + 1`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }
    : {
        dataRevision: sql`${schema.propertyRevisions.dataRevision} + 1`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      };
  await db
    .update(schema.propertyRevisions)
    .set(values)
    .where(eq(schema.propertyRevisions.propertyId, propertyId));
}

export async function nextPropertyCode(
  identity: RequestIdentity,
  propertyId: string,
  prefix: string,
): Promise<string> {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const normalized = prefix.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,11}$/.test(normalized)) {
    throw new InvalidRequestError("The permanent-code prefix is invalid.");
  }

  // Ensure the row exists, then let one SQLite UPDATE both reserve and return
  // the next value. Concurrent writers cannot receive the same sequence value.
  await db
    .insert(schema.propertyCodeCounters)
    .values({ propertyId, codePrefix: normalized, nextValue: 1 })
    .onConflictDoNothing();
  const reserved = await db
    .update(schema.propertyCodeCounters)
    .set({
      nextValue: sql`${schema.propertyCodeCounters.nextValue} + 1`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(
      and(
        eq(schema.propertyCodeCounters.propertyId, propertyId),
        eq(schema.propertyCodeCounters.codePrefix, normalized),
      ),
    )
    .returning({ nextValue: schema.propertyCodeCounters.nextValue });
  const value = Number(reserved[0]?.nextValue) - 1;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("A permanent identifier could not be reserved.");
  }
  return `${normalized}-${value.toString().padStart(4, "0")}`;
}

const locationCodePrefixes = {
  structures: "STR",
  levels: "LVL",
  spaces: "SPC",
  "wall-zones": "WZN",
} as const;

export type LocationResourceKind = keyof typeof locationCodePrefixes;

export async function nextLocationCode(
  identity: RequestIdentity,
  propertyId: string,
  kind: LocationResourceKind,
): Promise<string> {
  await requireOwnedProperty(identity, propertyId);
  const table = tableFor(kind);
  const existing = await getDb()
    .select({ code: columnFor(table, "code") })
    .from(table)
    .where(eq(table.propertyId, propertyId));
  const unavailable = new Set(existing.map((row) => String(row.code)));

  // Imported or legacy location codes may predate their sequence counter. Keep
  // reserving until the counter reaches a value that is not already in use.
  while (true) {
    const candidate = await nextPropertyCode(
      identity,
      propertyId,
      locationCodePrefixes[kind],
    );
    if (!unavailable.has(candidate)) return candidate;
  }
}

export async function listResource(
  identity: RequestIdentity,
  propertyId: string,
  kind: ResourceKind,
) {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const table = tableFor(kind);
  const conditions: SQL[] = [eq(table.propertyId, propertyId)];
  if (lifecycleKinds.has(kind)) {
    conditions.push(ne(columnFor(table, "lifecycleState"), "archived"));
  }
  const rows = await db.select().from(table).where(and(...conditions));
  if (assetSubtypeKinds.has(kind)) {
    const activeAssets = await db
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(and(eq(schema.assets.propertyId, propertyId), ne(schema.assets.lifecycleState, "archived")));
    const activeIds = new Set(activeAssets.map((row) => row.id));
    return rows.filter((row) => activeIds.has(String(row.assetId)));
  }
  return rows;
}

export async function getResource(
  identity: RequestIdentity,
  propertyId: string,
  kind: ResourceKind,
  id: string,
) {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const table = tableFor(kind);
  const rows = await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.propertyId, propertyId),
        eq(columnFor(table, idColumnFor(kind)), id),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row || ("lifecycleState" in row && row.lifecycleState === "archived")) {
    throw new NotFoundError("Record not found.");
  }
  if (assetSubtypeKinds.has(kind)) {
    const parent = await db.query.assets.findFirst({
      where: and(
        eq(schema.assets.propertyId, propertyId),
        eq(schema.assets.id, id),
        ne(schema.assets.lifecycleState, "archived"),
      ),
    });
    if (!parent) throw new NotFoundError("Record not found.");
  }
  return row;
}

export async function createResource(
  context: MutationContext,
  kind: ResourceKind,
  values: Record<string, unknown>,
) {
  await requireOwnedProperty(context.identity, context.propertyId);
  const replay = await replayedResourceMutation(context, kind);
  if (replay) {
    return getResourceRow(context.identity, context.propertyId, kind, replay.entityId);
  }
  const db = getDb();
  const table = tableFor(kind);
  const idColumn = idColumnFor(kind);
  const id = typeof values[idColumn] === "string" ? values[idColumn] : crypto.randomUUID();
  const permanentCode =
    typeof values.permanentCode === "string" ? values.permanentCode : undefined;
  const record = {
    ...cleanCreateValues(table, values),
    [idColumn]: id,
    propertyId: context.propertyId,
    ...(permanentCode && "permanentCode" in table ? { permanentCode } : {}),
  };
  const insert = db.insert(table).values(record as never);
  const revise = db.update(schema.propertyRevisions).set(
    topologyKinds.has(kind)
      ? {
          dataRevision: sql`${schema.propertyRevisions.dataRevision} + 1`,
          topologyRevision: sql`${schema.propertyRevisions.topologyRevision} + 1`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        }
      : {
          dataRevision: sql`${schema.propertyRevisions.dataRevision} + 1`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
  ).where(eq(schema.propertyRevisions.propertyId, context.propertyId));
  const event = db.insert(schema.changeEvents).values({
    id: crypto.randomUUID(),
    propertyId: context.propertyId,
    actorSubject: context.identity.externalUserId,
    eventKind: "create",
    entityType: kind,
    entityId: id,
    entityRevision: 1,
    requestId: context.requestId ?? null,
    summary: `create ${kind}`,
  });
  try {
    runStatementsAtomically([insert, revise, event]);
  } catch (error) {
    const concurrentReplay = await replayedResourceMutation(context, kind);
    if (concurrentReplay) {
      return getResourceRow(context.identity, context.propertyId, kind, concurrentReplay.entityId);
    }
    throw error;
  }
  return getResource(context.identity, context.propertyId, kind, id);
}

async function getResourceRow(
  identity: RequestIdentity,
  propertyId: string,
  kind: ResourceKind,
  id: string,
) {
  await requireOwnedProperty(identity, propertyId);
  const table = tableFor(kind);
  const rows = await getDb().select().from(table).where(and(
    eq(table.propertyId, propertyId),
    eq(columnFor(table, idColumnFor(kind)), id),
  )).limit(1);
  if (!rows[0]) throw new NotFoundError("Record not found.");
  return rows[0];
}

export async function updateResource(
  context: MutationContext,
  kind: ResourceKind,
  id: string,
  revision: number | undefined,
  values: Record<string, unknown>,
) {
  await requireOwnedProperty(context.identity, context.propertyId);
  const replay = await replayedResourceMutation(context, kind);
  if (replay) {
    return getResourceRow(context.identity, context.propertyId, kind, replay.entityId);
  }
  const db = getDb();
  const table = tableFor(kind);
  const idColumn = columnFor(table, idColumnFor(kind));
  const supportsRevision = "revision" in table;
  if (supportsRevision && (!revision || revision < 1)) {
    throw new InvalidRequestError("A positive revision is required.");
  }
  const conditions: SQL[] = [
    eq(table.propertyId, context.propertyId),
    eq(idColumn, id),
  ];
  if (supportsRevision) {
    conditions.push(eq(columnFor(table, "revision"), revision as number));
  }
  const patch = cleanValues(table, values, kind);
  if (Object.keys(patch).length === 0) {
    throw new InvalidRequestError("At least one editable field is required.");
  }
  if (supportsRevision) {
    patch.revision = sql`${columnFor(table, "revision")} + 1`;
  }
  if ("updatedAt" in table) patch.updatedAt = sql`CURRENT_TIMESTAMP`;
  const update = db
    .update(table)
    .set(patch as never)
    .where(and(...conditions));
  const compiled = update.toSQL();
  const binding = getSqliteConnection();
  const guard = binding.prepare(compiled.sql).bind(...compiled.params);
  const topologySql = topologyKinds.has(kind)
    ? ", topology_revision = topology_revision + 1"
    : "";
  const eventKind = values.lifecycleState === "archived" ? "archive" : "update";
  const nextRevision = supportsRevision ? (revision as number) + 1 : null;
  let results: SqliteRunResult[];
  try {
    results = await binding.batch([
      guard,
      binding.prepare(
        `UPDATE property_revisions SET data_revision = data_revision + 1${topologySql}, updated_at = CURRENT_TIMESTAMP WHERE property_id = ? AND changes() = 1`,
      ).bind(context.propertyId),
      binding.prepare(
        "INSERT INTO change_events (id, property_id, actor_subject, event_kind, entity_type, entity_id, entity_revision, request_id, summary) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1",
      ).bind(
        crypto.randomUUID(),
        context.propertyId,
        context.identity.externalUserId,
        eventKind,
        kind,
        id,
        nextRevision,
        context.requestId ?? null,
        `${eventKind} ${kind}`,
      ),
    ]);
  } catch (error) {
    const concurrentReplay = await replayedResourceMutation(context, kind);
    if (concurrentReplay) {
      return getResourceRow(context.identity, context.propertyId, kind, concurrentReplay.entityId);
    }
    throw error;
  }
  if ((results[0]?.changes ?? 0) !== 1) {
    const concurrentReplay = await replayedResourceMutation(context, kind);
    if (concurrentReplay) {
      return getResourceRow(context.identity, context.propertyId, kind, concurrentReplay.entityId);
    }
    const existing = await getResourceRow(
      context.identity,
      context.propertyId,
      kind,
      id,
    ).catch(() => null);
    if (!existing) throw new NotFoundError("Record not found.");
    throw new ConflictError("This record changed after it was loaded.");
  }
  return getResourceRow(context.identity, context.propertyId, kind, id);
}

export async function getPropertyOverview(
  identity: RequestIdentity,
  propertyId: string,
) {
  const property = await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const revision = await db.query.propertyRevisions.findFirst({
    where: eq(schema.propertyRevisions.propertyId, propertyId),
  });
  const [assetCount, breakerCount, circuitCount, spaceCount, openUpgradeCount] =
    await Promise.all([
      db.select({ value: count() }).from(schema.assets).where(and(eq(schema.assets.propertyId, propertyId), ne(schema.assets.lifecycleState, "archived"))),
      db.select({ value: count() }).from(schema.breakers).where(and(eq(schema.breakers.propertyId, propertyId), ne(schema.breakers.lifecycleState, "archived"))),
      db.select({ value: count() }).from(schema.circuits).where(and(eq(schema.circuits.propertyId, propertyId), ne(schema.circuits.lifecycleState, "archived"))),
      db.select({ value: count() }).from(schema.spaces).where(and(eq(schema.spaces.propertyId, propertyId), ne(schema.spaces.lifecycleState, "archived"))),
      db.select({ value: count() }).from(schema.upgradeItems).where(and(eq(schema.upgradeItems.propertyId, propertyId), ne(schema.upgradeItems.status, "verified"))),
    ]);
  return {
    property,
    counts: {
      assets: assetCount[0]?.value ?? 0,
      breakers: breakerCount[0]?.value ?? 0,
      circuits: circuitCount[0]?.value ?? 0,
      spaces: spaceCount[0]?.value ?? 0,
      openUpgrades: openUpgradeCount[0]?.value ?? 0,
    },
    revisions: revision ?? { dataRevision: 0, topologyRevision: 0 },
  };
}

export async function assertRecordsBelongToProperty(
  identity: RequestIdentity,
  propertyId: string,
  checks: Array<{ kind: ResourceKind; id: string | null | undefined }>,
) {
  for (const check of checks) {
    if (check.id) await getResource(identity, propertyId, check.kind, check.id);
  }
}
