import { and, asc, eq, inArray, ne, or } from "drizzle-orm";

import {
  getDb,
  getSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedStatement,
  type SqliteRunResult,
} from "@/db";
import * as schema from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import type {
  BoxBondPointRecord,
  BoxConductorEndRecord,
  BoxConductorFunction,
  BoxConductorKind,
  BoxConductorRecord,
  BoxOpenEndpointRecord,
  BoxSpliceRecord,
  BoxTerminalRecord,
  BoxTerminationCertainty,
  BoxTerminationMethod,
  BoxTerminationModel,
} from "@/features/boxes";
import {
  ConflictError,
  InvalidRequestError,
  NotFoundError,
} from "@/lib/http/responses";

import { nextPropertyCode } from "./core";
import { requireOwnedProperty } from "./workspaces";

export const boxTerminationKinds = [
  "terminals",
  "splices",
  "open-endpoints",
  "bond-points",
  "conductors",
  "conductor-ends",
] as const;

export type BoxTerminationKind = (typeof boxTerminationKinds)[number];

type MutationContext = {
  identity: RequestIdentity;
  propertyId: string;
  requestId?: string | null;
};

const toUiConductorKind: Record<string, BoxConductorKind> = {
  cable_core: "cable-core",
  cable_equipment_ground: "equipment-ground",
  pigtail: "pigtail",
  jumper: "jumper",
  device_lead: "device-lead",
  standalone_raceway: "standalone",
  unknown: "unknown",
  custom: "custom",
};

const fromUiConductorKind: Record<BoxConductorKind, (typeof schema.conductorKinds)[number]> = {
  "cable-core": "cable_core",
  "equipment-ground": "cable_equipment_ground",
  pigtail: "pigtail",
  jumper: "jumper",
  "device-lead": "device_lead",
  standalone: "standalone_raceway",
  unknown: "unknown",
  custom: "custom",
};

function hyphenate<T extends string>(value: string): T {
  return value.replaceAll("_", "-") as T;
}

function underscore<T extends string>(value: string): T {
  return value.replaceAll("-", "_") as T;
}

export function databaseConductorKind(value: BoxConductorKind) {
  return fromUiConductorKind[value];
}

export function databaseConductorRole(value: BoxConductorFunction | null | undefined) {
  return value ? underscore<(typeof schema.conductorRoles)[number]>(value) : null;
}

export function databaseTerminationMethod(value: BoxTerminationMethod) {
  return underscore<(typeof schema.terminationMethods)[number]>(value);
}

export function databaseCertainty(value: BoxTerminationCertainty) {
  return underscore<(typeof schema.knowledgeStates)[number]>(value);
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function ownedBox(propertyId: string, boxId: string) {
  const db = getDb();
  const [asset, box] = await Promise.all([
    db.query.assets.findFirst({
      where: and(
        eq(schema.assets.propertyId, propertyId),
        eq(schema.assets.id, boxId),
        eq(schema.assets.kind, "box"),
        ne(schema.assets.lifecycleState, "archived"),
      ),
    }),
    db.query.boxes.findFirst({
      where: and(
        eq(schema.boxes.propertyId, propertyId),
        eq(schema.boxes.assetId, boxId),
      ),
    }),
  ]);
  if (!asset || !box) throw new NotFoundError("Box not found.");
  return { asset, box };
}

/**
 * Builds the editor model directly from normalized topology rows. Only ends
 * physically terminating at nodes in this box are included; their exact A/B
 * designation is preserved and the whole-house tracer supplies the far side.
 */
export async function getBoxTerminationModel(
  identity: RequestIdentity,
  propertyId: string,
  boxId: string,
): Promise<BoxTerminationModel> {
  await requireOwnedProperty(identity, propertyId);
  const { asset: boxAsset } = await ownedBox(propertyId, boxId);
  const db = getDb();

  const [mountRows, boxSpliceRows, boxBondRows] = await Promise.all([
    db.select().from(schema.assetMounts).where(and(
      eq(schema.assetMounts.propertyId, propertyId),
      eq(schema.assetMounts.boxAssetId, boxId),
    )).orderBy(asc(schema.assetMounts.startGangIndex), asc(schema.assetMounts.id)),
    db.select().from(schema.splices).where(and(
      eq(schema.splices.propertyId, propertyId),
      eq(schema.splices.boxAssetId, boxId),
    )),
    db.select().from(schema.bondPoints).where(and(
      eq(schema.bondPoints.propertyId, propertyId),
      eq(schema.bondPoints.boxAssetId, boxId),
    )),
  ]);

  const mountedAssetIds = [...new Set(mountRows.map((row) => row.mountedAssetId))];
  const subtypeNodeIds = [
    ...boxSpliceRows.map((row) => row.electricalNodeId),
    ...boxBondRows.map((row) => row.electricalNodeId),
  ];
  const nodeScope = [
    eq(schema.electricalNodes.containingBoxAssetId, boxId),
    ...(mountedAssetIds.length
      ? [inArray(schema.electricalNodes.containingAssetId, mountedAssetIds)]
      : []),
    ...(subtypeNodeIds.length
      ? [inArray(schema.electricalNodes.id, subtypeNodeIds)]
      : []),
  ];
  const nodeRows = await db.select().from(schema.electricalNodes).where(and(
    eq(schema.electricalNodes.propertyId, propertyId),
    ne(schema.electricalNodes.lifecycleState, "archived"),
    or(...nodeScope),
  )).orderBy(asc(schema.electricalNodes.id));
  const nodeIds = nodeRows.map((row) => row.id);

  const [terminalRows, spliceRows, openRows, bondRows, localEndRows] = nodeIds.length
    ? await Promise.all([
        db.select().from(schema.terminals).where(and(
          eq(schema.terminals.propertyId, propertyId),
          inArray(schema.terminals.electricalNodeId, nodeIds),
        )),
        db.select().from(schema.splices).where(and(
          eq(schema.splices.propertyId, propertyId),
          inArray(schema.splices.electricalNodeId, nodeIds),
        )),
        db.select().from(schema.openEndpoints).where(and(
          eq(schema.openEndpoints.propertyId, propertyId),
          inArray(schema.openEndpoints.electricalNodeId, nodeIds),
        )),
        db.select().from(schema.bondPoints).where(and(
          eq(schema.bondPoints.propertyId, propertyId),
          inArray(schema.bondPoints.electricalNodeId, nodeIds),
        )),
        db.select().from(schema.conductorEnds).where(and(
          eq(schema.conductorEnds.propertyId, propertyId),
          inArray(schema.conductorEnds.electricalNodeId, nodeIds),
        )).orderBy(asc(schema.conductorEnds.conductorId), asc(schema.conductorEnds.designation)),
      ])
    : [[], [], [], [], []];

  const conductorIds = [...new Set(localEndRows.map((row) => row.conductorId))];
  const conductorRows = conductorIds.length
    ? await db.select().from(schema.conductors).where(and(
        eq(schema.conductors.propertyId, propertyId),
        ne(schema.conductors.lifecycleState, "archived"),
        inArray(schema.conductors.id, conductorIds),
      )).orderBy(asc(schema.conductors.permanentCode))
    : [];
  const cableIds = [...new Set(conductorRows.flatMap((row) => row.cableAssetId ? [row.cableAssetId] : []))];
  const relatedAssetIds = [...new Set([
    boxId,
    ...mountedAssetIds,
    ...terminalRows.map((row) => row.owningAssetId),
    ...bondRows.flatMap((row) => row.owningAssetId ? [row.owningAssetId] : []),
    ...cableIds,
  ])];
  const relatedAssets = relatedAssetIds.length
    ? await db.select().from(schema.assets).where(and(
        eq(schema.assets.propertyId, propertyId),
        inArray(schema.assets.id, relatedAssetIds),
      ))
    : [];

  const nodeById = new Map(nodeRows.map((row) => [row.id, row]));
  const assetById = new Map(relatedAssets.map((row) => [row.id, row]));
  const conductorById = new Map(conductorRows.map((row) => [row.id, row]));

  const terminals: BoxTerminalRecord[] = terminalRows.map((row) => {
    const owner = assetById.get(row.owningAssetId);
    return {
      id: row.electricalNodeId,
      owningAssetId: row.owningAssetId,
      assetPermanentCode: owner?.permanentCode,
      assetLabel: owner?.displayName ?? "Unlabeled mounted device",
      terminalKey: row.terminalKey,
      manufacturerLabel: row.manufacturerLabel ?? undefined,
      semanticRole: row.semanticRole,
      terminalGroup: row.terminalGroup ?? undefined,
      notes: row.notes ?? undefined,
      revision: nodeById.get(row.electricalNodeId)?.revision,
    };
  });
  const splices: BoxSpliceRecord[] = spliceRows.map((row) => ({
    id: row.electricalNodeId,
    label: row.label ?? nodeById.get(row.electricalNodeId)?.label ?? "Unlabeled splice",
    connectorType: row.connectorType ?? undefined,
    notes: nodeById.get(row.electricalNodeId)?.notes ?? undefined,
    revision: nodeById.get(row.electricalNodeId)?.revision,
  }));
  const openEndpoints: BoxOpenEndpointRecord[] = openRows.map((row) => ({
    id: row.electricalNodeId,
    endpointKind: hyphenate(row.endpointKind),
    label: nodeById.get(row.electricalNodeId)?.label ?? undefined,
    description: row.description ?? undefined,
    revision: nodeById.get(row.electricalNodeId)?.revision,
  }));
  const bondPoints: BoxBondPointRecord[] = bondRows.map((row) => {
    const owner = row.owningAssetId ? assetById.get(row.owningAssetId) : assetById.get(row.boxAssetId ?? "");
    return {
      id: row.electricalNodeId,
      label: nodeById.get(row.electricalNodeId)?.label ?? "Bond point",
      ownerLabel: owner ? `${owner.displayName} · ${owner.permanentCode}` : undefined,
      description: row.description ?? undefined,
      revision: nodeById.get(row.electricalNodeId)?.revision,
    };
  });
  const conductors: BoxConductorRecord[] = conductorRows.map((row) => ({
    id: row.id,
    permanentCode: row.permanentCode,
    cableId: row.cableAssetId ?? undefined,
    cablePermanentCode: row.cableAssetId ? assetById.get(row.cableAssetId)?.permanentCode : undefined,
    kind: toUiConductorKind[row.kind] ?? "unknown",
    observedInsulationColor: row.observedInsulationColor ?? undefined,
    reidentificationMarking: row.reidentificationMarking ?? undefined,
    assignedFunction: row.assignedRole ? hyphenate<BoxConductorFunction>(row.assignedRole) : undefined,
    gauge: row.gauge,
    notes: row.notes ?? undefined,
    revision: row.revision,
  }));
  const conductorEnds: BoxConductorEndRecord[] = localEndRows.flatMap((row) => {
    const conductor = conductorById.get(row.conductorId);
    if (!conductor) return [];
    return [{
      id: row.id,
      conductorId: row.conductorId,
      designation: row.designation,
      nodeId: row.electricalNodeId,
      terminationMethod: hyphenate(row.terminationMethod),
      certainty: hyphenate<BoxTerminationCertainty>(row.certainty),
      notes: row.notes ?? undefined,
      revision: conductor.revision,
    }];
  });

  return {
    boxId,
    permanentCode: boxAsset.permanentCode,
    label: boxAsset.displayName,
    terminals,
    splices,
    openEndpoints,
    bondPoints,
    conductors,
    conductorEnds,
  };
}

function mutationTail(
  database: SqliteConnection,
  context: MutationContext,
  entityType: string,
  entityId: string,
  entityRevision: number | null,
  eventKind: "create" | "update" | "archive",
) {
  return [
    database.prepare(
      "UPDATE property_revisions SET data_revision = data_revision + 1, topology_revision = topology_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE property_id = ?",
    ).bind(context.propertyId),
    database.prepare(
      "INSERT INTO change_events (id, property_id, actor_subject, event_kind, entity_type, entity_id, entity_revision, request_id, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      context.propertyId,
      context.identity.externalUserId,
      eventKind,
      entityType,
      entityId,
      entityRevision,
      context.requestId ?? null,
      `${eventKind} ${entityType}`,
    ),
  ];
}

async function mutationAlreadyApplied(context: MutationContext) {
  if (!context.requestId) return false;
  const event = await getDb().query.changeEvents.findFirst({ where: and(
    eq(schema.changeEvents.propertyId, context.propertyId),
    eq(schema.changeEvents.requestId, context.requestId),
  ) });
  return Boolean(event);
}

async function runGuardedBatch(
  context: MutationContext,
  guard: SqlitePreparedStatement,
  statements: SqlitePreparedStatement[],
  entityType: string,
  entityId: string,
  nextRevision: number,
  guardTarget: { kind: "conductor" | "node"; id: string },
  eventKind: "update" | "archive" = "update",
) {
  const database = getSqliteConnection();
  let results: SqliteRunResult[];
  try {
    results = await database.batch([
      guard,
      database.prepare(
        "SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('') END AS revision_guard",
      ),
      ...statements,
      ...mutationTail(database, context, entityType, entityId, nextRevision, eventKind),
    ]);
  } catch (error) {
    if (await mutationAlreadyApplied(context)) return;
    const db = getDb();
    const latest = guardTarget.kind === "conductor"
      ? await db.query.conductors.findFirst({ where: and(
          eq(schema.conductors.propertyId, context.propertyId),
          eq(schema.conductors.id, guardTarget.id),
        ) })
      : await db.query.electricalNodes.findFirst({ where: and(
          eq(schema.electricalNodes.propertyId, context.propertyId),
          eq(schema.electricalNodes.id, guardTarget.id),
        ) });
    if (!latest || latest.revision >= nextRevision) {
      throw new ConflictError("This termination changed after it was loaded.");
    }
    throw error;
  }
  if ((results[0]?.changes ?? 0) !== 1) {
    throw new ConflictError("This termination changed after it was loaded.");
  }
}

function sqlPatch(
  table: string,
  idColumn: string,
  id: string,
  propertyId: string,
  values: Array<[column: string, value: string | number | null]>,
) {
  if (!values.length) throw new InvalidRequestError("At least one editable field is required.");
  const database = getSqliteConnection();
  return database.prepare(
    `UPDATE ${table} SET ${values.map(([column]) => `${column} = ?`).join(", ")} WHERE property_id = ? AND ${idColumn} = ?`,
  ).bind(...values.map(([, value]) => value), propertyId, id);
}

async function requireNodeRevision(propertyId: string, id: string, revision: number) {
  const db = getDb();
  const row = await db.query.electricalNodes.findFirst({ where: and(
    eq(schema.electricalNodes.propertyId, propertyId),
    eq(schema.electricalNodes.id, id),
    ne(schema.electricalNodes.lifecycleState, "archived"),
  ) });
  if (!row) throw new NotFoundError("Termination point not found.");
  if (row.revision !== revision) throw new ConflictError("This termination changed after it was loaded.");
  return row;
}

async function requireConductorRevision(propertyId: string, id: string, revision: number) {
  const db = getDb();
  const row = await db.query.conductors.findFirst({ where: and(
    eq(schema.conductors.propertyId, propertyId),
    eq(schema.conductors.id, id),
    ne(schema.conductors.lifecycleState, "archived"),
  ) });
  if (!row) throw new NotFoundError("Conductor not found.");
  if (row.revision !== revision) throw new ConflictError("This conductor changed after it was loaded.");
  return row;
}

export type PatchBoxTerminationInput =
  | { kind: "terminals"; values: Partial<Pick<BoxTerminalRecord, "terminalKey" | "manufacturerLabel" | "semanticRole" | "terminalGroup">> }
  | { kind: "splices"; values: Partial<Pick<BoxSpliceRecord, "label" | "connectorType">> }
  | { kind: "open-endpoints"; values: Partial<Pick<BoxOpenEndpointRecord, "endpointKind" | "label" | "description">> }
  | { kind: "bond-points"; values: Partial<Pick<BoxBondPointRecord, "label" | "description">> }
  | { kind: "conductors"; values: Partial<Pick<BoxConductorRecord, "kind" | "observedInsulationColor" | "reidentificationMarking" | "assignedFunction" | "gauge">> }
  | { kind: "conductor-ends"; values: Partial<Pick<BoxConductorEndRecord, "nodeId" | "terminationMethod" | "certainty">> };

export async function patchBoxTermination(
  context: MutationContext,
  boxId: string,
  id: string,
  revision: number,
  input: PatchBoxTerminationInput,
) {
  await requireOwnedProperty(context.identity, context.propertyId);
  await ownedBox(context.propertyId, boxId);
  if (await mutationAlreadyApplied(context)) {
    return getBoxTerminationModel(context.identity, context.propertyId, boxId);
  }
  const database = getSqliteConnection();

  if (input.kind === "conductors") {
    const conductor = await requireConductorRevision(context.propertyId, id, revision);
    const model = await getBoxTerminationModel(context.identity, context.propertyId, boxId);
    if (!model.conductors.some((item) => item.id === id)) throw new NotFoundError("Conductor is not terminated in this box.");
    const values: Array<[string, string | null]> = [];
    if (input.values.kind !== undefined) values.push(["kind", databaseConductorKind(input.values.kind)]);
    if (input.values.observedInsulationColor !== undefined) values.push(["observed_insulation_color", nonEmpty(input.values.observedInsulationColor)]);
    if (input.values.reidentificationMarking !== undefined) values.push(["reidentification_marking", nonEmpty(input.values.reidentificationMarking)]);
    if (input.values.assignedFunction !== undefined) values.push(["assigned_role", databaseConductorRole(input.values.assignedFunction)]);
    if (input.values.gauge !== undefined) values.push(["gauge", nonEmpty(input.values.gauge)]);
    if (!values.length) throw new InvalidRequestError("At least one editable conductor field is required.");
    const guard = database.prepare(
      `UPDATE conductors SET ${values.map(([column]) => `${column} = ?`).join(", ")}, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE property_id = ? AND id = ? AND revision = ? AND lifecycle_state <> 'archived'`,
    ).bind(...values.map(([, value]) => value), context.propertyId, id, revision);
    await runGuardedBatch(context, guard, [], "conductors", id, conductor.revision + 1, { kind: "conductor", id });
    return getBoxTerminationModel(context.identity, context.propertyId, boxId);
  }

  if (input.kind === "conductor-ends") {
    const db = getDb();
    const end = await db.query.conductorEnds.findFirst({ where: and(
      eq(schema.conductorEnds.propertyId, context.propertyId),
      eq(schema.conductorEnds.id, id),
    ) });
    if (!end) throw new NotFoundError("Conductor end not found.");
    const conductor = await requireConductorRevision(context.propertyId, end.conductorId, revision);
    const model = await getBoxTerminationModel(context.identity, context.propertyId, boxId);
    if (!model.conductorEnds.some((item) => item.id === id)) throw new NotFoundError("Conductor end is not terminated in this box.");
    const values: Array<[string, string | null]> = [];
    if (input.values.nodeId !== undefined) {
      if (!input.values.nodeId) throw new InvalidRequestError("Choose a recorded terminal, splice, open endpoint, or bond point.");
      if (![...model.terminals, ...model.splices, ...model.openEndpoints, ...model.bondPoints].some((item) => item.id === input.values.nodeId)) {
        throw new InvalidRequestError("The selected connection point is not in this box.");
      }
      values.push(["electrical_node_id", input.values.nodeId]);
    }
    if (input.values.terminationMethod !== undefined) values.push(["termination_method", databaseTerminationMethod(input.values.terminationMethod)]);
    if (input.values.certainty !== undefined) values.push(["certainty", databaseCertainty(input.values.certainty)]);
    const statement = sqlPatch("conductor_ends", "id", id, context.propertyId, values);
    const guard = database.prepare(
      "UPDATE conductors SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE property_id = ? AND id = ? AND revision = ? AND lifecycle_state <> 'archived'",
    ).bind(context.propertyId, end.conductorId, revision);
    await runGuardedBatch(context, guard, [statement], "conductor-ends", id, conductor.revision + 1, { kind: "conductor", id: end.conductorId });
    return getBoxTerminationModel(context.identity, context.propertyId, boxId);
  }

  const node = await requireNodeRevision(context.propertyId, id, revision);
  const model = await getBoxTerminationModel(context.identity, context.propertyId, boxId);
  const collection = input.kind === "terminals" ? model.terminals
    : input.kind === "splices" ? model.splices
      : input.kind === "open-endpoints" ? model.openEndpoints
        : model.bondPoints;
  if (!collection.some((item) => item.id === id)) throw new NotFoundError("Termination point is not in this box.");

  const nodeValues: Array<[string, string | null]> = [];
  let child: SqlitePreparedStatement | null;
  if (input.kind === "terminals") {
    const values: Array<[string, string | null]> = [];
    if (input.values.terminalKey !== undefined) {
      const key = nonEmpty(input.values.terminalKey);
      if (!key) throw new InvalidRequestError("A terminal key is required.");
      values.push(["terminal_key", key]);
    }
    if (input.values.manufacturerLabel !== undefined) values.push(["manufacturer_label", nonEmpty(input.values.manufacturerLabel)]);
    if (input.values.semanticRole !== undefined) values.push(["semantic_role", input.values.semanticRole]);
    if (input.values.terminalGroup !== undefined) values.push(["terminal_group", nonEmpty(input.values.terminalGroup)]);
    child = sqlPatch("terminals", "electrical_node_id", id, context.propertyId, values);
  } else if (input.kind === "splices") {
    const values: Array<[string, string | null]> = [];
    if (input.values.label !== undefined) values.push(["label", nonEmpty(input.values.label)]);
    if (input.values.connectorType !== undefined) values.push(["connector_type", nonEmpty(input.values.connectorType)]);
    child = sqlPatch("splices", "electrical_node_id", id, context.propertyId, values);
  } else if (input.kind === "open-endpoints") {
    const values: Array<[string, string | null]> = [];
    if (input.values.endpointKind !== undefined) values.push(["endpoint_kind", underscore(input.values.endpointKind)]);
    if (input.values.description !== undefined) values.push(["description", nonEmpty(input.values.description)]);
    if (input.values.label !== undefined) nodeValues.push(["label", nonEmpty(input.values.label)]);
    child = values.length
      ? sqlPatch("open_endpoints", "electrical_node_id", id, context.propertyId, values)
      : null;
  } else {
    const values: Array<[string, string | null]> = [];
    if (input.values.description !== undefined) values.push(["description", nonEmpty(input.values.description)]);
    if (input.values.label !== undefined) nodeValues.push(["label", nonEmpty(input.values.label)]);
    child = values.length
      ? sqlPatch("bond_points", "electrical_node_id", id, context.propertyId, values)
      : null;
  }
  if (!nodeValues.length && !child) throw new InvalidRequestError("At least one editable field is required.");
  const guard = database.prepare(
    `UPDATE electrical_nodes SET ${nodeValues.map(([column]) => `${column} = ?, `).join("")}revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE property_id = ? AND id = ? AND revision = ? AND lifecycle_state <> 'archived'`,
  ).bind(...nodeValues.map(([, value]) => value), context.propertyId, id, revision);
  await runGuardedBatch(context, guard, child ? [child] : [], input.kind, id, node.revision + 1, { kind: "node", id });
  return getBoxTerminationModel(context.identity, context.propertyId, boxId);
}

export type CreateBoxTerminationInput =
  | { kind: "terminals"; owningAssetId: string; terminalKey: string; manufacturerLabel?: string | null; semanticRole?: BoxTerminalRecord["semanticRole"]; terminalGroup?: string | null }
  | { kind: "splices"; label: string; connectorType?: string | null }
  | { kind: "open-endpoints"; label?: string | null; endpointKind?: BoxOpenEndpointRecord["endpointKind"]; description?: string | null }
  | { kind: "bond-points"; label: string; description?: string | null }
  | { kind: "conductors"; conductorKind?: BoxConductorKind; observedInsulationColor?: string | null; gauge?: string | null }
  | { kind: "conductor-ends"; conductorId: string; designation: "A" | "B"; nodeId: string; terminationMethod?: BoxTerminationMethod; certainty?: BoxTerminationCertainty; revision: number };

async function createNodeTermination(
  context: MutationContext,
  boxId: string,
  kind: (typeof schema.electricalNodeKinds)[number],
  label: string | null,
  containingAssetId: string | null,
  entityType: string,
  child: (database: SqliteConnection, nodeId: string) => SqlitePreparedStatement,
) {
  const database = getSqliteConnection();
  const nodeId = crypto.randomUUID();
  try {
    await database.batch([
      database.prepare(
        "INSERT INTO electrical_nodes (id, property_id, kind, containing_box_asset_id, containing_asset_id, label, certainty, lifecycle_state, revision) VALUES (?, ?, ?, ?, ?, ?, 'unknown', 'active', 1)",
      ).bind(nodeId, context.propertyId, kind, boxId, containingAssetId, label),
      child(database, nodeId),
      ...mutationTail(database, context, entityType, nodeId, 1, "create"),
    ]);
  } catch (error) {
    if (!await mutationAlreadyApplied(context)) throw error;
  }
  return nodeId;
}

export async function createBoxTermination(
  context: MutationContext,
  boxId: string,
  input: CreateBoxTerminationInput,
) {
  await requireOwnedProperty(context.identity, context.propertyId);
  await ownedBox(context.propertyId, boxId);
  if (await mutationAlreadyApplied(context)) {
    return getBoxTerminationModel(context.identity, context.propertyId, boxId);
  }
  const db = getDb();
  const database = getSqliteConnection();

  if (input.kind === "terminals") {
    const [owner, mount] = await Promise.all([
      db.query.assets.findFirst({ where: and(eq(schema.assets.propertyId, context.propertyId), eq(schema.assets.id, input.owningAssetId), ne(schema.assets.lifecycleState, "archived")) }),
      db.query.assetMounts.findFirst({ where: and(eq(schema.assetMounts.propertyId, context.propertyId), eq(schema.assetMounts.boxAssetId, boxId), eq(schema.assetMounts.mountedAssetId, input.owningAssetId)) }),
    ]);
    if (!owner || !mount) throw new InvalidRequestError("Choose a device mounted in this box.");
    const terminalKey = nonEmpty(input.terminalKey);
    if (!terminalKey) throw new InvalidRequestError("A terminal key is required.");
    await createNodeTermination(context, boxId, "terminal", `${owner.displayName} — ${terminalKey}`, owner.id, input.kind, (binding, nodeId) =>
      binding.prepare("INSERT INTO terminals (electrical_node_id, property_id, owning_asset_id, terminal_key, manufacturer_label, semantic_role, terminal_group) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(nodeId, context.propertyId, owner.id, terminalKey, nonEmpty(input.manufacturerLabel), input.semanticRole ?? "UNKNOWN", nonEmpty(input.terminalGroup)),
    );
  } else if (input.kind === "splices") {
    const label = nonEmpty(input.label);
    if (!label) throw new InvalidRequestError("A splice label is required.");
    await createNodeTermination(context, boxId, "splice", label, null, input.kind, (binding, nodeId) =>
      binding.prepare("INSERT INTO splices (electrical_node_id, property_id, box_asset_id, connector_type, label) VALUES (?, ?, ?, ?, ?)")
        .bind(nodeId, context.propertyId, boxId, nonEmpty(input.connectorType), label),
    );
  } else if (input.kind === "open-endpoints") {
    await createNodeTermination(context, boxId, "open_endpoint", nonEmpty(input.label), null, input.kind, (binding, nodeId) =>
      binding.prepare("INSERT INTO open_endpoints (electrical_node_id, property_id, endpoint_kind, description) VALUES (?, ?, ?, ?)")
        .bind(nodeId, context.propertyId, underscore(input.endpointKind ?? "unknown"), nonEmpty(input.description)),
    );
  } else if (input.kind === "bond-points") {
    const label = nonEmpty(input.label);
    if (!label) throw new InvalidRequestError("A bond-point label is required.");
    await createNodeTermination(context, boxId, "bond_point", label, null, input.kind, (binding, nodeId) =>
      binding.prepare("INSERT INTO bond_points (electrical_node_id, property_id, box_asset_id, description) VALUES (?, ?, ?, ?)")
        .bind(nodeId, context.propertyId, boxId, nonEmpty(input.description)),
    );
  } else if (input.kind === "conductors") {
    const id = crypto.randomUUID();
    const endANodeId = crypto.randomUUID();
    const endBNodeId = crypto.randomUUID();
    const endAId = crypto.randomUUID();
    const endBId = crypto.randomUUID();
    const permanentCode = await nextPropertyCode(context.identity, context.propertyId, "COND");
    try {
      await database.batch([
        database.prepare("INSERT INTO conductors (id, property_id, permanent_code, kind, observed_insulation_color, gauge, lifecycle_state, revision) VALUES (?, ?, ?, ?, ?, ?, 'active', 1)")
          .bind(id, context.propertyId, permanentCode, databaseConductorKind(input.conductorKind ?? "unknown"), nonEmpty(input.observedInsulationColor), nonEmpty(input.gauge)),
        database.prepare("INSERT INTO electrical_nodes (id, property_id, kind, containing_box_asset_id, label, certainty, lifecycle_state, revision) VALUES (?, ?, 'open_endpoint', ?, ?, 'unknown', 'active', 1)")
          .bind(endANodeId, context.propertyId, boxId, `${permanentCode} end A — unresolved`),
        database.prepare("INSERT INTO open_endpoints (electrical_node_id, property_id, endpoint_kind, description) VALUES (?, ?, 'unknown', ?)")
          .bind(endANodeId, context.propertyId, "Created with the conductor; choose its observed termination when known."),
        database.prepare("INSERT INTO electrical_nodes (id, property_id, kind, containing_box_asset_id, label, certainty, lifecycle_state, revision) VALUES (?, ?, 'open_endpoint', ?, ?, 'unknown', 'active', 1)")
          .bind(endBNodeId, context.propertyId, boxId, `${permanentCode} end B — unresolved`),
        database.prepare("INSERT INTO open_endpoints (electrical_node_id, property_id, endpoint_kind, description) VALUES (?, ?, 'unknown', ?)")
          .bind(endBNodeId, context.propertyId, "Created with the conductor; choose its observed termination when known."),
        database.prepare("INSERT INTO conductor_ends (id, property_id, conductor_id, designation, electrical_node_id, termination_method, certainty) VALUES (?, ?, ?, 'A', ?, 'unknown', 'unknown')")
          .bind(endAId, context.propertyId, id, endANodeId),
        database.prepare("INSERT INTO conductor_ends (id, property_id, conductor_id, designation, electrical_node_id, termination_method, certainty) VALUES (?, ?, ?, 'B', ?, 'unknown', 'unknown')")
          .bind(endBId, context.propertyId, id, endBNodeId),
        ...mutationTail(database, context, input.kind, id, 1, "create"),
      ]);
    } catch (error) {
      if (!await mutationAlreadyApplied(context)) throw error;
    }
  } else {
    const conductor = await requireConductorRevision(context.propertyId, input.conductorId, input.revision);
    const model = await getBoxTerminationModel(context.identity, context.propertyId, boxId);
    if (!model.conductors.some((item) => item.id === input.conductorId)) {
      throw new InvalidRequestError("Choose a conductor already recorded at this box.");
    }
    if (![...model.terminals, ...model.splices, ...model.openEndpoints, ...model.bondPoints].some((item) => item.id === input.nodeId)) {
      throw new InvalidRequestError("Choose a connection point in this box.");
    }
    const duplicate = await db.query.conductorEnds.findFirst({ where: and(
      eq(schema.conductorEnds.propertyId, context.propertyId),
      eq(schema.conductorEnds.conductorId, input.conductorId),
      eq(schema.conductorEnds.designation, input.designation),
    ) });
    if (duplicate) throw new InvalidRequestError(`End ${input.designation} is already recorded for this conductor.`);
    const id = crypto.randomUUID();
    const guard = database.prepare("UPDATE conductors SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE property_id = ? AND id = ? AND revision = ? AND lifecycle_state <> 'archived'")
      .bind(context.propertyId, conductor.id, input.revision);
    const insert = database.prepare("INSERT INTO conductor_ends (id, property_id, conductor_id, designation, electrical_node_id, termination_method, certainty) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, context.propertyId, conductor.id, input.designation, input.nodeId, databaseTerminationMethod(input.terminationMethod ?? "unknown"), databaseCertainty(input.certainty ?? "unknown"));
    await runGuardedBatch(context, guard, [insert], input.kind, id, conductor.revision + 1, { kind: "conductor", id: conductor.id }, "update");
  }
  return getBoxTerminationModel(context.identity, context.propertyId, boxId);
}

export async function removeBoxTermination(
  context: MutationContext,
  boxId: string,
  kind: BoxTerminationKind,
  id: string,
  revision: number,
) {
  await requireOwnedProperty(context.identity, context.propertyId);
  await ownedBox(context.propertyId, boxId);
  if (await mutationAlreadyApplied(context)) {
    return getBoxTerminationModel(context.identity, context.propertyId, boxId);
  }
  const model = await getBoxTerminationModel(context.identity, context.propertyId, boxId);
  const database = getSqliteConnection();
  const db = getDb();

  if (kind === "conductor-ends") {
    const end = await db.query.conductorEnds.findFirst({ where: and(eq(schema.conductorEnds.propertyId, context.propertyId), eq(schema.conductorEnds.id, id)) });
    if (!end || !model.conductorEnds.some((item) => item.id === id)) throw new NotFoundError("Conductor end not found in this box.");
    const conductor = await requireConductorRevision(context.propertyId, end.conductorId, revision);
    const guard = database.prepare("UPDATE conductors SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE property_id = ? AND id = ? AND revision = ? AND lifecycle_state <> 'archived'")
      .bind(context.propertyId, conductor.id, revision);
    const remove = database.prepare("DELETE FROM conductor_ends WHERE property_id = ? AND id = ?").bind(context.propertyId, id);
    await runGuardedBatch(context, guard, [remove], kind, id, conductor.revision + 1, { kind: "conductor", id: conductor.id }, "archive");
    return getBoxTerminationModel(context.identity, context.propertyId, boxId);
  }

  if (kind === "conductors") {
    const conductor = await requireConductorRevision(context.propertyId, id, revision);
    if (!model.conductors.some((item) => item.id === id)) throw new NotFoundError("Conductor is not terminated in this box.");
    const attached = await db.query.conductorEnds.findFirst({ where: and(eq(schema.conductorEnds.propertyId, context.propertyId), eq(schema.conductorEnds.conductorId, id)) });
    if (attached) throw new InvalidRequestError("Remove both A/B conductor ends before removing this conductor.");
    const guard = database.prepare("UPDATE conductors SET lifecycle_state = 'archived', revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE property_id = ? AND id = ? AND revision = ? AND lifecycle_state <> 'archived'")
      .bind(context.propertyId, id, revision);
    await runGuardedBatch(context, guard, [], kind, id, conductor.revision + 1, { kind: "conductor", id }, "archive");
    return getBoxTerminationModel(context.identity, context.propertyId, boxId);
  }

  const collection = kind === "terminals" ? model.terminals
    : kind === "splices" ? model.splices
      : kind === "open-endpoints" ? model.openEndpoints
        : model.bondPoints;
  if (!collection.some((item) => item.id === id)) throw new NotFoundError("Termination point is not in this box.");
  const node = await requireNodeRevision(context.propertyId, id, revision);
  const [attachedEnd, fromConnection, toConnection, source] = await Promise.all([
    db.query.conductorEnds.findFirst({ where: and(eq(schema.conductorEnds.propertyId, context.propertyId), eq(schema.conductorEnds.electricalNodeId, id)) }),
    db.query.internalConnections.findFirst({ where: and(eq(schema.internalConnections.propertyId, context.propertyId), eq(schema.internalConnections.fromNodeId, id)) }),
    db.query.internalConnections.findFirst({ where: and(eq(schema.internalConnections.propertyId, context.propertyId), eq(schema.internalConnections.toNodeId, id)) }),
    db.query.circuitSources.findFirst({ where: and(eq(schema.circuitSources.propertyId, context.propertyId), eq(schema.circuitSources.electricalNodeId, id)) }),
  ]);
  if (attachedEnd || fromConnection || toConnection || source) {
    throw new InvalidRequestError("Move or remove attached conductor ends and connections before removing this point.");
  }
  const guard = database.prepare("UPDATE electrical_nodes SET lifecycle_state = 'archived', revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE property_id = ? AND id = ? AND revision = ? AND lifecycle_state <> 'archived'")
    .bind(context.propertyId, id, revision);
  await runGuardedBatch(context, guard, [], kind, id, node.revision + 1, { kind: "node", id }, "archive");
  return getBoxTerminationModel(context.identity, context.propertyId, boxId);
}
