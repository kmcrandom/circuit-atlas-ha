import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { getDb, runStatementsAtomically } from "@/db";
import {
  assets,
  changeEvents,
  circuits,
  panels,
  properties,
  propertyCodeCounters,
  propertyRevisions,
  workspaces,
} from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import { ConflictError, NotFoundError } from "@/lib/http/responses";

export type PropertySummary = {
  id: string;
  permanentCode: string;
  name: string;
  address: string | null;
  counts: {
    panels: number;
    assets: number;
    circuits: number;
  };
  revision: number;
  updatedAt: string;
};

const INSTALLATION_WORKSPACE_ID = "ws_circuit_atlas_installation";
const INSTALLATION_WORKSPACE_OWNER = "circuit-atlas-installation";

export async function ensureWorkspace(identity: RequestIdentity) {
  // Authentication is recorded on change events; all verified identities share
  // the one workspace owned by this Home Assistant installation.
  void identity;
  const db = getDb();
  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerSubject, INSTALLATION_WORKSPACE_OWNER),
  });
  if (existing) return existing;

  const created = {
    id: INSTALLATION_WORKSPACE_ID,
    ownerSubject: INSTALLATION_WORKSPACE_OWNER,
    displayName: "Circuit Atlas installation",
  };
  await db.insert(workspaces).values(created).onConflictDoNothing();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerSubject, INSTALLATION_WORKSPACE_OWNER),
  });
  if (!workspace) throw new Error("The workspace could not be initialized.");
  return workspace;
}

export async function listProperties(
  identity: RequestIdentity,
): Promise<PropertySummary[]> {
  const db = getDb();
  const workspace = await ensureWorkspace(identity);
  const rows = await db
    .select({
      id: properties.id,
      permanentCode: properties.permanentCode,
      name: properties.name,
      address: properties.address,
      revision: properties.revision,
      updatedAt: properties.updatedAt,
    })
    .from(properties)
    .where(
      and(
        eq(properties.workspaceId, workspace.id),
        ne(properties.lifecycleState, "archived"),
      ),
    )
    .orderBy(asc(properties.name));

  return Promise.all(
    rows.map(async (row) => {
      const [panelResult, assetResult, circuitResult] = await Promise.all([
        db
          .select({ value: count() })
          .from(panels)
          .innerJoin(
            assets,
            and(
              eq(assets.propertyId, panels.propertyId),
              eq(assets.id, panels.assetId),
              ne(assets.lifecycleState, "archived"),
            ),
          )
          .where(eq(panels.propertyId, row.id)),
        db
          .select({ value: count() })
          .from(assets)
          .where(
            and(eq(assets.propertyId, row.id), ne(assets.lifecycleState, "archived")),
          ),
        db
          .select({ value: count() })
          .from(circuits)
          .where(
            and(eq(circuits.propertyId, row.id), ne(circuits.lifecycleState, "archived")),
          ),
      ]);

      return {
        id: row.id,
        permanentCode: row.permanentCode,
        name: row.name,
        address: row.address,
        counts: {
          panels: panelResult[0]?.value ?? 0,
          assets: assetResult[0]?.value ?? 0,
          circuits: circuitResult[0]?.value ?? 0,
        },
        revision: row.revision,
        updatedAt: row.updatedAt,
      };
    }),
  );
}

function formatPropertyCode(value: number): string {
  return `PROP-${value.toString().padStart(4, "0")}`;
}

export async function createProperty(
  identity: RequestIdentity,
  input: { name: string; address?: string | null },
): Promise<PropertySummary> {
  const db = getDb();
  const workspace = await ensureWorkspace(identity);
  const id = crypto.randomUUID();

  const result = await db
    .select({ value: sql<number>`coalesce(max(cast(substr(${properties.permanentCode}, 6) as integer)), 0) + 1` })
    .from(properties)
    .where(eq(properties.workspaceId, workspace.id));
  const nextValue = Number(result[0]?.value ?? 1);
  const permanentCode = formatPropertyCode(nextValue);

  try {
    runStatementsAtomically([
      db.insert(properties).values({
        id,
        workspaceId: workspace.id,
        permanentCode,
        name: input.name,
        address: input.address ?? null,
      }),
      db.insert(propertyRevisions).values({ propertyId: id }),
      db.insert(propertyCodeCounters).values([
        { propertyId: id, codePrefix: "PNL", nextValue: 1 },
        { propertyId: id, codePrefix: "BRK", nextValue: 1 },
        { propertyId: id, codePrefix: "CKT", nextValue: 1 },
        { propertyId: id, codePrefix: "BOX", nextValue: 1 },
        { propertyId: id, codePrefix: "DEV", nextValue: 1 },
        { propertyId: id, codePrefix: "FIX", nextValue: 1 },
        { propertyId: id, codePrefix: "APL", nextValue: 1 },
        { propertyId: id, codePrefix: "CBL", nextValue: 1 },
        { propertyId: id, codePrefix: "CTL", nextValue: 1 },
      ]),
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw new ConflictError("A property identifier collision occurred. Try again.");
    }
    throw error;
  }

  return {
    id,
    permanentCode,
    name: input.name,
    address: input.address ?? null,
    counts: { panels: 0, assets: 0, circuits: 0 },
    revision: 1,
    updatedAt: new Date().toISOString(),
  };
}

export async function requireOwnedProperty(
  identity: RequestIdentity,
  propertyId: string,
) {
  const db = getDb();
  const workspace = await ensureWorkspace(identity);
  const property = await db.query.properties.findFirst({
    where: and(
      eq(properties.id, propertyId),
      eq(properties.workspaceId, workspace.id),
      ne(properties.lifecycleState, "archived"),
    ),
  });
  if (!property) throw new NotFoundError("Property not found.");
  return property;
}

export async function updateProperty(
  identity: RequestIdentity,
  propertyId: string,
  input: {
    revision: number;
    name?: string;
    address?: string | null;
    preferencesJson?: string;
    namingConfigJson?: string;
    lifecycleState?: "active" | "archived";
    requestId?: string | null;
  },
) {
  const db = getDb();
  const property = await requireOwnedProperty(identity, propertyId);
  if (property.revision !== input.revision) {
    throw new ConflictError("This property changed after it was loaded.");
  }

  const patch: Record<string, unknown> = {
    revision: sql`${properties.revision} + 1`,
    updatedAt: sql`CURRENT_TIMESTAMP`,
  };
  if (input.name !== undefined) patch.name = input.name;
  if (input.address !== undefined) patch.address = input.address;
  if (input.preferencesJson !== undefined) patch.preferencesJson = input.preferencesJson;
  if (input.namingConfigJson !== undefined) patch.namingConfigJson = input.namingConfigJson;
  if (input.lifecycleState !== undefined) {
    patch.lifecycleState = input.lifecycleState;
  }

  const updated = await db
    .update(properties)
    .set(patch)
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.workspaceId, property.workspaceId),
        eq(properties.revision, input.revision),
      ),
    )
    .returning();
  if (!updated[0]) {
    throw new ConflictError("This property changed after it was loaded.");
  }

  runStatementsAtomically([
    db
      .update(propertyRevisions)
      .set({
        dataRevision: sql`${propertyRevisions.dataRevision} + 1`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(propertyRevisions.propertyId, propertyId)),
    db.insert(changeEvents).values({
      id: crypto.randomUUID(),
      propertyId,
      actorSubject: identity.externalUserId,
      eventKind:
        input.lifecycleState === "archived" ? "archive" : "update",
      entityType: "property",
      entityId: propertyId,
      entityRevision: input.revision + 1,
      requestId: input.requestId ?? null,
      summary:
        input.lifecycleState === "archived"
          ? "archive property"
          : "update property",
    }),
  ]);

  return updated[0];
}
