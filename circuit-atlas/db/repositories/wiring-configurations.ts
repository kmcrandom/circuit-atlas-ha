import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import * as s from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import { ConflictError, InvalidRequestError, NotFoundError } from "@/lib/http/responses";
import { requireOwnedProperty } from "./workspaces";

export type WiringConfigurationStatus = (typeof s.wiringConfigurationStatuses)[number];

export type WiringConfigurationSummary = {
  id: string;
  name: string;
  status: WiringConfigurationStatus;
  sourceConfigurationId: string | null;
  supersedesConfigurationId: string | null;
  summary: string | null;
  verificationState: (typeof s.knowledgeStates)[number];
  capturedAt: string | null;
  effectiveAt: string | null;
  finalizedAt: string | null;
  revision: number;
  connectionCount: number;
  scopeCount: number;
  updatedAt: string;
};

async function configurationSummary(propertyId: string, id: string): Promise<WiringConfigurationSummary> {
  const db = getDb();
  const row = await db.query.wiringConfigurations.findFirst({
    where: and(eq(s.wiringConfigurations.propertyId, propertyId), eq(s.wiringConfigurations.id, id)),
  });
  if (!row) throw new NotFoundError("Wiring configuration not found.");
  const [connections, scopes] = await Promise.all([
    db.select({ value: count() }).from(s.conductorEndConnections).where(and(eq(s.conductorEndConnections.propertyId, propertyId), eq(s.conductorEndConnections.wiringConfigurationId, id))),
    db.select({ value: count() }).from(s.wiringConfigurationScopes).where(and(eq(s.wiringConfigurationScopes.propertyId, propertyId), eq(s.wiringConfigurationScopes.wiringConfigurationId, id))),
  ]);
  return {
    ...row,
    connectionCount: connections[0]?.value ?? 0,
    scopeCount: scopes[0]?.value ?? 0,
  };
}

async function ensureBaselineConfiguration(propertyId: string) {
  const db = getDb();
  const existing = await db.query.wiringConfigurations.findFirst({
    where: and(eq(s.wiringConfigurations.propertyId, propertyId), eq(s.wiringConfigurations.status, "current")),
  });
  if (existing) return existing;
  const id = crypto.randomUUID();
  await db.insert(s.wiringConfigurations).values({
    id,
    propertyId,
    name: "Current wiring",
    status: "current",
    effectiveAt: new Date().toISOString(),
  });
  const created = await db.query.wiringConfigurations.findFirst({
    where: and(eq(s.wiringConfigurations.propertyId, propertyId), eq(s.wiringConfigurations.id, id)),
  });
  if (!created) throw new Error("The baseline wiring configuration could not be created.");
  return created;
}

export async function resolveWiringConfiguration(
  identity: RequestIdentity,
  propertyId: string,
  configurationId?: string | null,
) {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  if (!configurationId) return ensureBaselineConfiguration(propertyId);
  const row = await db.query.wiringConfigurations.findFirst({
    where: and(eq(s.wiringConfigurations.propertyId, propertyId), eq(s.wiringConfigurations.id, configurationId)),
  });
  if (!row) throw new NotFoundError("Wiring configuration not found.");
  return row;
}

export async function requireEditableWiringConfiguration(
  identity: RequestIdentity,
  propertyId: string,
  configurationId?: string | null,
) {
  const configuration = await resolveWiringConfiguration(identity, propertyId, configurationId);
  if (configuration.status === "historical") {
    throw new ConflictError("Historical wiring configurations are read-only. Clone this configuration to make a correction or reversion plan.");
  }
  return configuration;
}

export async function listWiringConfigurations(identity: RequestIdentity, propertyId: string) {
  await requireOwnedProperty(identity, propertyId);
  await ensureBaselineConfiguration(propertyId);
  const rows = await getDb().select({ id: s.wiringConfigurations.id }).from(s.wiringConfigurations)
    .where(eq(s.wiringConfigurations.propertyId, propertyId))
    .orderBy(sql`case ${s.wiringConfigurations.status} when 'current' then 0 when 'planned' then 1 when 'draft' then 2 else 3 end`, asc(s.wiringConfigurations.updatedAt));
  return Promise.all(rows.map((row) => configurationSummary(propertyId, row.id)));
}

export async function createWiringConfiguration(
  identity: RequestIdentity,
  propertyId: string,
  input: { name: string; status?: "draft" | "planned"; summary?: string | null; sourceConfigurationId?: string | null },
) {
  await requireOwnedProperty(identity, propertyId);
  if (input.sourceConfigurationId) {
    return cloneWiringConfiguration(identity, propertyId, input.sourceConfigurationId, input);
  }
  const id = crypto.randomUUID();
  await getDb().insert(s.wiringConfigurations).values({
    id,
    propertyId,
    name: input.name,
    status: input.status ?? "draft",
    summary: input.summary ?? null,
  });
  return configurationSummary(propertyId, id);
}

export async function updateWiringConfiguration(
  identity: RequestIdentity,
  propertyId: string,
  configurationId: string,
  input: { revision: number; name?: string; summary?: string | null; verificationState?: (typeof s.knowledgeStates)[number]; capturedAt?: string | null },
) {
  const configuration = await requireEditableWiringConfiguration(identity, propertyId, configurationId);
  if (configuration.revision !== input.revision) throw new ConflictError("This wiring configuration changed after it was loaded.");
  const updated = await getDb().update(s.wiringConfigurations).set({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...(input.verificationState !== undefined ? { verificationState: input.verificationState } : {}),
    ...(input.capturedAt !== undefined ? { capturedAt: input.capturedAt } : {}),
    revision: sql`${s.wiringConfigurations.revision} + 1`,
    updatedAt: sql`CURRENT_TIMESTAMP`,
  }).where(and(
    eq(s.wiringConfigurations.propertyId, propertyId),
    eq(s.wiringConfigurations.id, configurationId),
    eq(s.wiringConfigurations.revision, input.revision),
  )).returning({ id: s.wiringConfigurations.id });
  if (!updated[0]) throw new ConflictError("This wiring configuration changed after it was loaded.");
  return configurationSummary(propertyId, configurationId);
}

export async function cloneWiringConfiguration(
  identity: RequestIdentity,
  propertyId: string,
  sourceConfigurationId: string,
  input: { name: string; status?: "draft" | "planned"; summary?: string | null },
) {
  const source = await resolveWiringConfiguration(identity, propertyId, sourceConfigurationId);
  const db = getDb();
  const id = crypto.randomUUID();
  const [nodes, connections, mounts, positions, assertions, gaps, members, links, scopes] = await Promise.all([
    db.select().from(s.wiringConfigurationNodes).where(and(eq(s.wiringConfigurationNodes.propertyId, propertyId), eq(s.wiringConfigurationNodes.wiringConfigurationId, source.id))),
    db.select().from(s.conductorEndConnections).where(and(eq(s.conductorEndConnections.propertyId, propertyId), eq(s.conductorEndConnections.wiringConfigurationId, source.id))),
    db.select().from(s.assetMounts).where(and(eq(s.assetMounts.propertyId, propertyId), eq(s.assetMounts.wiringConfigurationId, source.id))),
    db.select().from(s.assetMountPositions).where(and(eq(s.assetMountPositions.propertyId, propertyId), eq(s.assetMountPositions.wiringConfigurationId, source.id))),
    db.select().from(s.assetCircuitAssertions).where(and(eq(s.assetCircuitAssertions.propertyId, propertyId), eq(s.assetCircuitAssertions.wiringConfigurationId, source.id))),
    db.select().from(s.traceGaps).where(and(eq(s.traceGaps.propertyId, propertyId), eq(s.traceGaps.wiringConfigurationId, source.id))),
    db.select().from(s.controlMembers).where(and(eq(s.controlMembers.propertyId, propertyId), eq(s.controlMembers.wiringConfigurationId, source.id))),
    db.select().from(s.controlLinks).where(and(eq(s.controlLinks.propertyId, propertyId), eq(s.controlLinks.wiringConfigurationId, source.id))),
    db.select().from(s.wiringConfigurationScopes).where(and(eq(s.wiringConfigurationScopes.propertyId, propertyId), eq(s.wiringConfigurationScopes.wiringConfigurationId, source.id))),
  ]);
  const mountIds = new Map(mounts.map((row) => [row.id, crypto.randomUUID()]));
  db.transaction((tx) => {
    tx.insert(s.wiringConfigurations).values({ id, propertyId, name: input.name, status: input.status ?? "planned", sourceConfigurationId: source.id, summary: input.summary ?? null }).run();
    if (nodes.length) tx.insert(s.wiringConfigurationNodes).values(nodes.map((row) => ({ ...row, wiringConfigurationId: id }))).run();
    if (connections.length) tx.insert(s.conductorEndConnections).values(connections.map((row) => ({ ...row, id: crypto.randomUUID(), wiringConfigurationId: id, revision: 1, createdAt: undefined, updatedAt: undefined }))).run();
    if (mounts.length) tx.insert(s.assetMounts).values(mounts.map((row) => ({ ...row, id: mountIds.get(row.id)!, wiringConfigurationId: id, revision: 1, createdAt: undefined, updatedAt: undefined }))).run();
    if (positions.length) tx.insert(s.assetMountPositions).values(positions.map((row) => ({ ...row, mountId: mountIds.get(row.mountId)!, wiringConfigurationId: id }))).run();
    if (assertions.length) tx.insert(s.assetCircuitAssertions).values(assertions.map((row) => ({ ...row, id: crypto.randomUUID(), wiringConfigurationId: id, revision: 1, createdAt: undefined, updatedAt: undefined }))).run();
    if (gaps.length) tx.insert(s.traceGaps).values(gaps.map((row) => ({ ...row, id: crypto.randomUUID(), wiringConfigurationId: id, revision: 1, createdAt: undefined, updatedAt: undefined }))).run();
    if (members.length) tx.insert(s.controlMembers).values(members.map((row) => ({ ...row, id: crypto.randomUUID(), wiringConfigurationId: id }))).run();
    if (links.length) tx.insert(s.controlLinks).values(links.map((row) => ({ ...row, id: crypto.randomUUID(), wiringConfigurationId: id }))).run();
    if (scopes.length) tx.insert(s.wiringConfigurationScopes).values(scopes.map((row) => ({ ...row, id: crypto.randomUUID(), wiringConfigurationId: id }))).run();
    tx.update(s.propertyRevisions).set({ dataRevision: sql`${s.propertyRevisions.dataRevision} + 1`, topologyRevision: sql`${s.propertyRevisions.topologyRevision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(s.propertyRevisions.propertyId, propertyId)).run();
    tx.insert(s.changeEvents).values({ id: crypto.randomUUID(), propertyId, actorSubject: identity.externalUserId, eventKind: "create", entityType: "wiring_configuration", entityId: id, entityRevision: 1, summary: `clone wiring configuration from ${source.id}` }).run();
  });
  return configurationSummary(propertyId, id);
}

export async function activateWiringConfiguration(
  identity: RequestIdentity,
  propertyId: string,
  configurationId: string,
  input: { revision: number; expectedCurrentConfigurationId: string; effectiveAt?: string | null },
) {
  const candidate = await requireEditableWiringConfiguration(identity, propertyId, configurationId);
  if (candidate.status !== "planned") throw new InvalidRequestError("Only a planned wiring configuration can be activated.");
  if (candidate.revision !== input.revision) throw new ConflictError("This wiring configuration changed after it was loaded.");
  const db = getDb();
  const current = await ensureBaselineConfiguration(propertyId);
  if (current.id !== input.expectedCurrentConfigurationId) throw new ConflictError("The current wiring configuration changed. Review the comparison again before activating.");
  const timestamp = input.effectiveAt ?? new Date().toISOString();
  db.transaction((tx) => {
    tx.update(s.wiringConfigurations).set({ status: "historical", finalizedAt: timestamp, revision: sql`${s.wiringConfigurations.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(s.wiringConfigurations.propertyId, propertyId), eq(s.wiringConfigurations.id, current.id), eq(s.wiringConfigurations.status, "current"))).run();
    const promoted = tx.update(s.wiringConfigurations).set({ status: "current", supersedesConfigurationId: current.id, effectiveAt: timestamp, revision: sql`${s.wiringConfigurations.revision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(s.wiringConfigurations.propertyId, propertyId), eq(s.wiringConfigurations.id, candidate.id), eq(s.wiringConfigurations.status, "planned"), eq(s.wiringConfigurations.revision, input.revision))).run();
    if (promoted.changes !== 1) throw new ConflictError("This wiring configuration changed after it was loaded.");
    tx.update(s.propertyRevisions).set({ dataRevision: sql`${s.propertyRevisions.dataRevision} + 1`, topologyRevision: sql`${s.propertyRevisions.topologyRevision} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(s.propertyRevisions.propertyId, propertyId)).run();
    tx.insert(s.changeEvents).values({ id: crypto.randomUUID(), propertyId, actorSubject: identity.externalUserId, eventKind: "update", entityType: "wiring_configuration", entityId: candidate.id, entityRevision: candidate.revision + 1, summary: `activate wiring configuration; preserve ${current.id} as historical` }).run();
  });
  return configurationSummary(propertyId, configurationId);
}

export async function compareWiringConfigurations(
  identity: RequestIdentity,
  propertyId: string,
  fromConfigurationId: string,
  toConfigurationId: string,
) {
  const [from, to] = await Promise.all([
    resolveWiringConfiguration(identity, propertyId, fromConfigurationId),
    resolveWiringConfiguration(identity, propertyId, toConfigurationId),
  ]);
  const db = getDb();
  const rows = await db.select({
    wiringConfigurationId: s.conductorEndConnections.wiringConfigurationId,
    conductorEndId: s.conductorEndConnections.conductorEndId,
    electricalNodeId: s.conductorEndConnections.electricalNodeId,
    conductorRole: s.conductorEndConnections.conductorRole,
    connectionState: s.conductorEndConnections.connectionState,
    terminationMethod: s.conductorEndConnections.terminationMethod,
  }).from(s.conductorEndConnections).where(and(
    eq(s.conductorEndConnections.propertyId, propertyId),
    inArray(s.conductorEndConnections.wiringConfigurationId, [from.id, to.id]),
  ));
  const byConfiguration = (id: string) => new Map(rows.filter((row) => row.wiringConfigurationId === id).map((row) => [row.conductorEndId, {
    conductorEndId: row.conductorEndId,
    electricalNodeId: row.electricalNodeId,
    conductorRole: row.conductorRole,
    connectionState: row.connectionState,
    terminationMethod: row.terminationMethod,
  }]));
  const fromRows = byConfiguration(from.id);
  const toRows = byConfiguration(to.id);
  const ids = new Set([...fromRows.keys(), ...toRows.keys()]);
  const conductorEnds = [...ids].flatMap((id) => {
    const before = fromRows.get(id) ?? null;
    const after = toRows.get(id) ?? null;
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    return [{ conductorEndId: id, change: before && after ? "changed" as const : before ? "removed" as const : "added" as const, before, after }];
  });
  const compareRows = <T extends Record<string, unknown>>(all: T[], configurationKey: keyof T, identity: (row: T) => string, projection: (row: T) => unknown) => {
    const side = (configurationId: string) => new Map(all.filter((row) => row[configurationKey] === configurationId).map((row) => [identity(row), projection(row)]));
    const before = side(from.id);
    const after = side(to.id);
    const keys = new Set([...before.keys(), ...after.keys()]);
    return [...keys].filter((key) => JSON.stringify(before.get(key)) !== JSON.stringify(after.get(key))).length;
  };
  const [mountRows, assertionRows, gapRows, memberRows, linkRows, nodeRows] = await Promise.all([
    db.select().from(s.assetMounts).where(and(eq(s.assetMounts.propertyId, propertyId), inArray(s.assetMounts.wiringConfigurationId, [from.id, to.id]))),
    db.select().from(s.assetCircuitAssertions).where(and(eq(s.assetCircuitAssertions.propertyId, propertyId), inArray(s.assetCircuitAssertions.wiringConfigurationId, [from.id, to.id]))),
    db.select().from(s.traceGaps).where(and(eq(s.traceGaps.propertyId, propertyId), inArray(s.traceGaps.wiringConfigurationId, [from.id, to.id]))),
    db.select().from(s.controlMembers).where(and(eq(s.controlMembers.propertyId, propertyId), inArray(s.controlMembers.wiringConfigurationId, [from.id, to.id]))),
    db.select().from(s.controlLinks).where(and(eq(s.controlLinks.propertyId, propertyId), inArray(s.controlLinks.wiringConfigurationId, [from.id, to.id]))),
    db.select().from(s.wiringConfigurationNodes).where(and(eq(s.wiringConfigurationNodes.propertyId, propertyId), inArray(s.wiringConfigurationNodes.wiringConfigurationId, [from.id, to.id]))),
  ]);
  const summary = {
    conductorEnds: conductorEnds.length,
    mounts: compareRows(mountRows, "wiringConfigurationId", (row) => row.mountedAssetId, (row) => [row.boxAssetId, row.startGangIndex, row.gangSpan, row.rotationDegrees]),
    assertions: compareRows(assertionRows, "wiringConfigurationId", (row) => `${row.assetId}:${row.assetFunctionId ?? ""}:${row.circuitId}`, (row) => [row.status, row.certainty]),
    traceGaps: compareRows(gapRows, "wiringConfigurationId", (row) => `${row.fromNodeId ?? ""}:${row.toNodeId ?? ""}:${row.fromAssetId ?? ""}:${row.toAssetId ?? ""}`, (row) => [row.status, row.certainty, row.description]),
    controlMembers: compareRows(memberRows, "wiringConfigurationId", (row) => `${row.controlGroupId}:${row.assetFunctionId}`, (row) => [row.role, row.method, row.sortOrder]),
    controlLinks: compareRows(linkRows, "wiringConfigurationId", (row) => `${row.controlGroupId}:${row.fromFunctionId}:${row.toFunctionId}`, (row) => [row.method, row.certainty]),
    nodes: compareRows(nodeRows, "wiringConfigurationId", (row) => row.electricalNodeId, () => true),
  };
  return { from: await configurationSummary(propertyId, from.id), to: await configurationSummary(propertyId, to.id), conductorEnds, summary, totalChanges: Object.values(summary).reduce((total, value) => total + value, 0) };
}
