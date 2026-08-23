import { getTableConfig } from "drizzle-orm/sqlite-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  getSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedStatement,
} from "@/db";
import * as dbs from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import {
  createPrivatePropertyFileKey,
  isPrivateFileKeyScopedToProperty,
  isSha256Hex,
  sha256Hex,
  validatePrivateFile,
  type PrivateFileCategory,
} from "@/lib/files";
import { getPrivateFileStore } from "@/lib/files/local-store";
import {
  previewPropertyImport,
  canonicalJson,
  sealPropertyManifest,
  serializePropertyManifest,
  validatePropertyManifest,
  type ImportPreview,
  type JsonObject,
  type PropertyManifestV1,
  type UnsealedPropertyManifestV1,
} from "@/lib/import-export";
import { ConflictError, InvalidRequestError } from "@/lib/http/responses";
import { requireOwnedProperty } from "./workspaces";

type SqlValue = string | number | null;
type SqlRow = Record<string, SqlValue>;

type PortableTableDefinition = {
  kind: string;
  table: SQLiteTable;
};

/** Parent-before-child order is also the atomic import statement order. */
const PORTABLE_TABLES: readonly PortableTableDefinition[] = [
  { kind: "property_code_counters", table: dbs.propertyCodeCounters },
  { kind: "property_revisions", table: dbs.propertyRevisions },
  { kind: "evidence", table: dbs.evidence },
  { kind: "structures", table: dbs.structures },
  { kind: "levels", table: dbs.levels },
  { kind: "spaces", table: dbs.spaces },
  { kind: "wall_zones", table: dbs.wallZones },
  { kind: "assets", table: dbs.assets },
  // Attachment metadata is inserted before floor plans during import.
  { kind: "floor_plans", table: dbs.floorPlans },
  { kind: "asset_aliases", table: dbs.assetAliases },
  { kind: "asset_locations", table: dbs.assetLocations },
  { kind: "plan_placements", table: dbs.planPlacements },
  { kind: "product_models", table: dbs.productModels },
  { kind: "installed_products", table: dbs.installedProducts },
  { kind: "installed_device_details", table: dbs.installedDeviceDetails },
  { kind: "devices", table: dbs.devices },
  { kind: "fixtures", table: dbs.fixtures },
  { kind: "appliances", table: dbs.appliances },
  { kind: "asset_functions", table: dbs.assetFunctions },
  { kind: "lamp_holders", table: dbs.lampHolders },
  { kind: "light_sources", table: dbs.lightSources },
  { kind: "plug_connections", table: dbs.plugConnections },
  { kind: "panels", table: dbs.panels },
  { kind: "panel_positions", table: dbs.panelPositions },
  { kind: "breakers", table: dbs.breakers },
  { kind: "breaker_poles", table: dbs.breakerPoles },
  { kind: "circuits", table: dbs.circuits },
  { kind: "panel_feeders", table: dbs.panelFeeders },
  { kind: "boxes", table: dbs.boxes },
  { kind: "box_ports", table: dbs.boxPorts },
  { kind: "asset_mounts", table: dbs.assetMounts },
  { kind: "asset_mount_positions", table: dbs.assetMountPositions },
  { kind: "diagram_annotations", table: dbs.diagramAnnotations },
  { kind: "cables", table: dbs.cables },
  { kind: "cable_ends", table: dbs.cableEnds },
  { kind: "conductors", table: dbs.conductors },
  { kind: "electrical_nodes", table: dbs.electricalNodes },
  { kind: "terminals", table: dbs.terminals },
  { kind: "splices", table: dbs.splices },
  { kind: "open_endpoints", table: dbs.openEndpoints },
  { kind: "bond_points", table: dbs.bondPoints },
  { kind: "conductor_ends", table: dbs.conductorEnds },
  { kind: "internal_connections", table: dbs.internalConnections },
  { kind: "circuit_sources", table: dbs.circuitSources },
  { kind: "shared_neutral_groups", table: dbs.sharedNeutralGroups },
  { kind: "shared_neutral_members", table: dbs.sharedNeutralMembers },
  { kind: "asset_circuit_assertions", table: dbs.assetCircuitAssertions },
  { kind: "trace_gaps", table: dbs.traceGaps },
  { kind: "control_groups", table: dbs.controlGroups },
  { kind: "control_members", table: dbs.controlMembers },
  { kind: "control_links", table: dbs.controlLinks },
  { kind: "upgrade_items", table: dbs.upgradeItems },
  { kind: "upgrade_requirements", table: dbs.upgradeRequirements },
  { kind: "upgrade_observations", table: dbs.upgradeObservations },
  { kind: "proposed_products", table: dbs.proposedProducts },
  { kind: "evidence_links", table: dbs.evidenceLinks },
  { kind: "capture_drafts", table: dbs.captureDrafts },
  { kind: "change_events", table: dbs.changeEvents },
] as const;

const TABLE_BY_KIND = new Map(PORTABLE_TABLES.map((item) => [item.kind, item]));
const ATTACHMENT_OWNER_TABLE: Readonly<Record<string, string>> = {
  asset: "assets",
  evidence: "evidence",
  assertion: "asset_circuit_assertions",
  floor_plan: "floor_plans",
  capture_draft: "capture_drafts",
  upgrade_item: "upgrade_items",
};
const MAX_IMPORT_RECORDS = 800;
const MAX_IMPORT_ATTACHMENT_BYTES = 64 * 1024 * 1024;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function tableDetails(definition: PortableTableDefinition) {
  const config = getTableConfig(definition.table);
  const inlinePrimary = config.columns.filter((column) => column.primary);
  const compositePrimary = config.primaryKeys.flatMap((key) => key.columns);
  const primaryColumns = inlinePrimary.length ? inlinePrimary : compositePrimary;
  if (!primaryColumns.length) {
    throw new Error(`Portable table ${definition.kind} has no primary key.`);
  }
  return {
    name: config.name,
    columns: config.columns.map((column) => column.name),
    primaryColumns: primaryColumns.map((column) => column.name),
  };
}

async function portableRecordId(
  definition: PortableTableDefinition,
  row: SqlRow,
): Promise<string> {
  const { primaryColumns } = tableDetails(definition);
  if (primaryColumns.length === 1) {
    const value = String(row[primaryColumns[0]] ?? "");
    const candidate = `${definition.kind}:${value}`;
    if (
      candidate.length <= 128 &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(candidate)
    ) {
      return candidate;
    }
  }
  const identity = primaryColumns.map((column) => [column, row[column]]);
  return `${definition.kind}:${await sha256Hex(JSON.stringify(identity))}`;
}

function withoutKeys(row: SqlRow, excluded: readonly string[]): JsonObject {
  const excludedSet = new Set(excluded);
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !excludedSet.has(key)),
  ) as JsonObject;
}

async function selectPropertyRows(
  definition: PortableTableDefinition,
  propertyId: string,
): Promise<SqlRow[]> {
  const binding = getSqliteConnection();
  const { name, primaryColumns } = tableDetails(definition);
  const order = primaryColumns.map(quoteIdentifier).join(", ");
  const result = await binding
    .prepare(
      `SELECT * FROM ${quoteIdentifier(name)} WHERE property_id = ? ORDER BY ${order}`,
    )
    .bind(propertyId)
    .all<SqlRow>();
  return result.results ?? [];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new InvalidRequestError("An attachment contains invalid base64 data.");
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new InvalidRequestError("An attachment contains invalid base64 data.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function attachmentContents(
  propertyId: string,
  objectKey: string,
): Promise<Uint8Array> {
  if (!(await isPrivateFileKeyScopedToProperty(objectKey, propertyId))) {
    throw new Error("An attachment has an invalid private storage scope.");
  }
  const object = await getPrivateFileStore().get(objectKey);
  if (!object) throw new Error("An attachment object is missing from private storage.");
  return object.bytes();
}

function attachmentCategory(ownerType: string): PrivateFileCategory {
  if (ownerType === "floor_plan") return "floor-plan";
  if (ownerType === "evidence") return "evidence";
  return "attachment";
}

export type PropertyExportOptions = {
  /** Embedded bytes make the JSON self-contained and importable. */
  includeFiles?: boolean;
};

export async function buildPropertyExport(
  identity: RequestIdentity,
  propertyId: string,
  options: PropertyExportOptions = {},
): Promise<PropertyManifestV1> {
  const property = await requireOwnedProperty(identity, propertyId);
  const includeFiles = options.includeFiles ?? true;
  const revisionRows = await selectPropertyRows(
    TABLE_BY_KIND.get("property_revisions")!,
    propertyId,
  );
  const dataRevision = Number(revisionRows[0]?.data_revision ?? 0);
  const recordGroups = await Promise.all(
    PORTABLE_TABLES.map(async (definition) => {
      const rows = await selectPropertyRows(definition, propertyId);
      return Promise.all(
        rows.map(async (row) => ({
          id: await portableRecordId(definition, row),
          propertyId,
          kind: definition.kind,
          revision: Number(row.revision ?? dataRevision),
          data: withoutKeys(row, ["property_id"]),
        })),
      );
    }),
  );

  const attachmentResult = await getSqliteConnection()
    .prepare(
      "SELECT * FROM attachments WHERE property_id = ? ORDER BY id",
    )
    .bind(propertyId)
    .all<SqlRow>();
  const attachmentChecksums: Array<{ attachmentId: string; sha256: string }> = [];
  const portableAttachments = [];
  let embeddedBytes = 0;

  for (const row of attachmentResult.results ?? []) {
    const id = String(row.id);
    const ownerType = String(row.owner_type);
    const ownerId = String(row.owner_id);
    let owner: { kind: "property" | "record"; id: string };
    if (ownerType === "property") {
      if (ownerId !== propertyId) {
        throw new Error("A property attachment has an invalid owner.");
      }
      owner = { kind: "property", id: propertyId };
    } else {
      const ownerTableKind = ATTACHMENT_OWNER_TABLE[ownerType];
      if (!ownerTableKind) {
        throw new Error(`Attachment ${id} has an unsupported owner type.`);
      }
      owner = { kind: "record", id: `${ownerTableKind}:${ownerId}` };
    }

    let contents: Uint8Array | null = null;
    let checksum = typeof row.sha256 === "string" && isSha256Hex(row.sha256)
      ? row.sha256
      : null;
    if (includeFiles || !checksum) {
      contents = await attachmentContents(propertyId, String(row.object_key));
      if (contents.byteLength !== Number(row.byte_size)) {
        throw new Error(`Attachment ${id} does not match its stored size.`);
      }
      const calculated = await sha256Hex(contents);
      if (checksum && checksum !== calculated) {
        throw new Error(`Attachment ${id} does not match its checksum.`);
      }
      checksum = calculated;
    }
    if (!checksum) throw new Error(`Attachment ${id} has no usable checksum.`);
    if (contents) {
      embeddedBytes += contents.byteLength;
      if (embeddedBytes > MAX_IMPORT_ATTACHMENT_BYTES) {
        throw new InvalidRequestError(
          `Embedded property exports are limited to ${MAX_IMPORT_ATTACHMENT_BYTES} bytes of files.`,
        );
      }
    }
    attachmentChecksums.push({ attachmentId: id, sha256: checksum });
    portableAttachments.push({
      id,
      propertyId,
      revision: Number(row.revision ?? 1),
      owner,
      purpose: ownerType,
      originalName: String(row.original_file_name),
      mediaType: String(row.mime_type),
      byteLength: Number(row.byte_size),
      ...(includeFiles ? { archivePath: `attachments/${id}` } : {}),
      data: {
        widthPixels: row.width_pixels,
        heightPixels: row.height_pixels,
        pageCount: row.page_count,
        altText: row.alt_text,
        lifecycleState: row.lifecycle_state,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(contents ? { contentBase64: bytesToBase64(contents) } : {}),
      },
    });
  }

  const unsealed: UnsealedPropertyManifestV1 = {
    format: "circuit-atlas/property",
    schemaVersion: 1,
    exportId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    generator: { name: "Circuit Atlas", version: "0.1.0" },
    property: {
      id: property.id,
      revision: property.revision,
      data: {
        name: property.name,
        address: property.address,
        preferencesJson: property.preferencesJson,
        namingConfigJson: property.namingConfigJson,
        lifecycleState: property.lifecycleState,
        createdAt: property.createdAt,
        updatedAt: property.updatedAt,
      },
    },
    records: recordGroups.flat(),
    relationships: [],
    attachments: portableAttachments,
    checksums: {
      algorithm: "SHA-256",
      attachments: attachmentChecksums,
    },
  };
  return sealPropertyManifest(unsealed);
}

export async function serializePropertyExport(
  identity: RequestIdentity,
  propertyId: string,
  options: PropertyExportOptions = {},
): Promise<string> {
  return serializePropertyManifest(
    await buildPropertyExport(identity, propertyId, options),
  );
}

export type PortabilityConstraint = {
  code:
    | "attachment_content_missing"
    | "attachment_content_invalid"
    | "attachment_owner_unsupported"
    | "attachment_update_unsupported"
    | "import_too_large"
    | "invalid_property_data"
    | "property_id_unavailable"
    | "relationships_unsupported"
    | "unknown_record_kind";
  message: string;
  entityId?: string;
};

export type PropertyImportPreview = ImportPreview & {
  canApply: boolean;
  confirmationToken: string | null;
  constraints: PortabilityConstraint[];
};

async function propertyById(propertyId: string): Promise<SqlRow | null> {
  const result = await getSqliteConnection()
    .prepare("SELECT * FROM properties WHERE id = ? LIMIT 1")
    .bind(propertyId)
    .all<SqlRow>();
  return result.results?.[0] ?? null;
}

function hasEmbeddedAttachmentContents(manifest: PropertyManifestV1): boolean {
  return manifest.attachments.some(
    (attachment) => typeof attachment.data.contentBase64 === "string",
  );
}

function importConfirmationToken(
  mode: "add" | "merge",
  anchorPropertyId: string,
  manifest: PropertyManifestV1,
  preview: ImportPreview,
): Promise<string> {
  return sha256Hex(
    canonicalJson({
      scope: "circuit-atlas-import",
      mode,
      anchorPropertyId,
      manifestSha256: manifest.checksums.manifestSha256,
      targetPropertyId: preview.targetPropertyId,
      outcomes: preview.outcomes,
      summary: preview.summary,
    }),
  );
}

export async function previewOwnedPropertyImport(
  identity: RequestIdentity,
  anchorPropertyId: string,
  incoming: unknown,
  mode: "add" | "merge",
): Promise<PropertyImportPreview> {
  const anchor = await requireOwnedProperty(identity, anchorPropertyId);
  const validation = await validatePropertyManifest(incoming);
  if (!validation.valid || !validation.manifest) {
    const preview = await previewPropertyImport({ incoming, mode });
    return {
      ...preview,
      canApply: false,
      confirmationToken: null,
      constraints: [],
    };
  }
  const manifest = validation.manifest;
  const constraints: PortabilityConstraint[] = [];
  try {
    propertyData(manifest);
  } catch (error) {
    constraints.push({
      code: "invalid_property_data",
      message:
        error instanceof Error
          ? error.message
          : "The imported property metadata is invalid.",
    });
  }
  if (manifest.relationships.length > 0) {
    constraints.push({
      code: "relationships_unsupported",
      message:
        "This application version imports relationships encoded in its typed records and cannot apply standalone relationship entries.",
    });
  }
  for (const record of manifest.records) {
    if (!TABLE_BY_KIND.has(record.kind)) {
      constraints.push({
        code: "unknown_record_kind",
        entityId: record.id,
        message: `Record type ${record.kind} is not supported by this application version.`,
      });
    }
  }
  if (manifest.records.length + manifest.attachments.length > MAX_IMPORT_RECORDS) {
    constraints.push({
      code: "import_too_large",
      message: `A confirmed import may contain at most ${MAX_IMPORT_RECORDS} records and attachments.`,
    });
  }
  const checksumByAttachment = new Map(
    manifest.checksums.attachments.map((item) => [item.attachmentId, item.sha256]),
  );
  for (const attachment of manifest.attachments) {
    if (typeof attachment.data.contentBase64 !== "string") {
      constraints.push({
        code: "attachment_content_missing",
        entityId: attachment.id,
        message: "This attachment has metadata but no embedded private file content.",
      });
    } else {
      const expectedChecksum = checksumByAttachment.get(attachment.id);
      try {
        if (!expectedChecksum) {
          throw new InvalidRequestError("The attachment checksum is missing.");
        }
        await validateIncomingAttachment(attachment, expectedChecksum);
      } catch (error) {
        constraints.push({
          code: "attachment_content_invalid",
          entityId: attachment.id,
          message:
            error instanceof Error
              ? error.message
              : "The embedded attachment is invalid.",
        });
      }
    }
    if (attachment.owner.kind === "relationship") {
      constraints.push({
        code: "attachment_owner_unsupported",
        entityId: attachment.id,
        message: "Attachments owned by standalone relationships are not supported.",
      });
    } else if (attachment.owner.kind === "record") {
      const expectedTable = ATTACHMENT_OWNER_TABLE[attachment.purpose];
      if (!expectedTable || !attachment.owner.id.startsWith(`${expectedTable}:`)) {
        constraints.push({
          code: "attachment_owner_unsupported",
          entityId: attachment.id,
          message: "The attachment owner type does not match its record.",
        });
      }
    } else if (attachment.purpose !== "property") {
      constraints.push({
        code: "attachment_owner_unsupported",
        entityId: attachment.id,
        message: "A property-owned attachment must use the property purpose.",
      });
    }
  }
  const declaredAttachmentBytes = manifest.attachments.reduce(
    (total, attachment) => total + attachment.byteLength,
    0,
  );
  if (declaredAttachmentBytes > MAX_IMPORT_ATTACHMENT_BYTES) {
    constraints.push({
      code: "import_too_large",
      message: `Imported private files are limited to ${MAX_IMPORT_ATTACHMENT_BYTES} bytes.`,
    });
  }

  let target: PropertyManifestV1 | null = null;
  if (mode === "merge") {
    if (manifest.property.id === anchorPropertyId) {
      target = await buildPropertyExport(identity, anchorPropertyId, {
        includeFiles: hasEmbeddedAttachmentContents(manifest),
      });
    }
  } else {
    const existing = await propertyById(manifest.property.id);
    if (existing) {
      if (
        existing.workspace_id === anchor.workspaceId &&
        existing.lifecycle_state !== "archived"
      ) {
        target = await buildPropertyExport(identity, manifest.property.id, {
          includeFiles: hasEmbeddedAttachmentContents(manifest),
        });
      } else {
        constraints.push({
          code: "property_id_unavailable",
          message: "The imported property identifier is unavailable.",
        });
      }
    }
  }

  const preview = await previewPropertyImport({ incoming: manifest, mode, target });
  for (const outcome of preview.outcomes) {
    if (outcome.entityKind === "attachment" && outcome.action === "update") {
      constraints.push({
        code: "attachment_update_unsupported",
        entityId: outcome.id,
        message: "Existing private files are preserved; import a new attachment ID instead of replacing file bytes.",
      });
    }
  }
  const canApply = preview.canApply && constraints.length === 0;
  return {
    ...preview,
    canApply,
    confirmationToken: canApply
      ? await importConfirmationToken(mode, anchorPropertyId, manifest, preview)
      : null,
    constraints,
  };
}

function bindValues(statement: SqlitePreparedStatement, values: SqlValue[]) {
  return statement.bind(...values);
}

function rowForImport(
  definition: PortableTableDefinition,
  record: PropertyManifestV1["records"][number],
  propertyId: string,
): SqlRow {
  const { columns } = tableDetails(definition);
  const allowed = new Set(columns);
  const entries = Object.entries(record.data);
  for (const [key, value] of entries) {
    if (!allowed.has(key) || key === "property_id") {
      throw new InvalidRequestError(
        `Record ${record.id} contains an unsupported database field.`,
      );
    }
    if (value !== null && typeof value !== "string" && typeof value !== "number") {
      throw new InvalidRequestError(
        `Record ${record.id} contains a non-scalar database field.`,
      );
    }
  }
  const row: SqlRow = {
    ...(record.data as SqlRow),
    property_id: propertyId,
  };
  if (
    allowed.has("revision") &&
    Number(row.revision) !== record.revision
  ) {
    throw new InvalidRequestError(
      `Record ${record.id} has inconsistent revision data.`,
    );
  }
  return row;
}

async function assertRecordIdentity(
  definition: PortableTableDefinition,
  record: PropertyManifestV1["records"][number],
  row: SqlRow,
) {
  if ((await portableRecordId(definition, row)) !== record.id) {
    throw new InvalidRequestError(
      `Record ${record.id} does not match its primary-key data.`,
    );
  }
}

function insertStatement(
  binding: SqliteConnection,
  tableName: string,
  row: SqlRow,
): SqlitePreparedStatement {
  const columns = Object.keys(row);
  const sql = `INSERT INTO ${quoteIdentifier(tableName)} (${columns
    .map(quoteIdentifier)
    .join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  return bindValues(
    binding.prepare(sql),
    columns.map((column) => row[column]),
  );
}

function updateStatement(
  binding: SqliteConnection,
  tableName: string,
  row: SqlRow,
  primaryColumns: readonly string[],
): SqlitePreparedStatement {
  const primarySet = new Set(primaryColumns);
  const setColumns = Object.keys(row).filter(
    (column) => column !== "property_id" && !primarySet.has(column),
  );
  if (!setColumns.length) {
    return binding
      .prepare("SELECT 1 WHERE 1 = 1")
      .bind();
  }
  const whereColumns = [
    ...new Set(["property_id", ...primaryColumns]),
  ];
  const sql = `UPDATE ${quoteIdentifier(tableName)} SET ${setColumns
    .map((column) => `${quoteIdentifier(column)} = ?`)
    .join(", ")} WHERE ${whereColumns
    .map((column) => `${quoteIdentifier(column)} = ?`)
    .join(" AND ")}`;
  return bindValues(binding.prepare(sql), [
    ...setColumns.map((column) => row[column]),
    ...whereColumns.map((column) => row[column]),
  ]);
}

function propertyData(manifest: PropertyManifestV1) {
  const data = manifest.property.data;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) throw new InvalidRequestError("The imported property needs a name.");
  if (name.length > 120) {
    throw new InvalidRequestError("The imported property name is too long.");
  }
  if (
    typeof data.address === "string" &&
    data.address.length > 240
  ) {
    throw new InvalidRequestError("The imported property address is too long.");
  }
  if (manifest.property.revision < 1) {
    throw new InvalidRequestError("The imported property revision must be positive.");
  }
  if (
    data.lifecycleState !== undefined &&
    data.lifecycleState !== "active"
  ) {
    throw new InvalidRequestError(
      "Import cannot archive or remove a property.",
    );
  }
  const jsonObjectText = (value: unknown, field: string): string => {
    const text = typeof value === "string" ? value : "{}";
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not an object");
      }
    } catch {
      throw new InvalidRequestError(`${field} must contain a JSON object.`);
    }
    return text;
  };
  return {
    name,
    address: typeof data.address === "string" ? data.address : null,
    preferencesJson: jsonObjectText(data.preferencesJson, "preferencesJson"),
    namingConfigJson: jsonObjectText(data.namingConfigJson, "namingConfigJson"),
    // Import never archives an existing or newly added property as a side effect.
    lifecycleState: "active" as const,
    createdAt:
      typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
    updatedAt:
      typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}

async function nextImportedPropertyCode(workspaceId: string): Promise<string> {
  const result = await getSqliteConnection()
    .prepare(
      "SELECT coalesce(max(cast(substr(permanent_code, 6) as integer)), 0) + 1 AS next_value FROM properties WHERE workspace_id = ? AND permanent_code GLOB 'PROP-[0-9]*'",
    )
    .bind(workspaceId)
    .all<{ next_value: number }>();
  return `PROP-${Number(result.results?.[0]?.next_value ?? 1)
    .toString()
    .padStart(4, "0")}`;
}

type StagedAttachment = {
  id: string;
  objectKey: string;
  row: SqlRow;
};

type ValidatedIncomingAttachment = {
  bytes: Uint8Array;
  checksum: string;
  mimeType: string;
  sanitizedName: string;
  lifecycleState: string;
  widthPixels: number | null;
  heightPixels: number | null;
  pageCount: number | null;
  altText: string | null;
  createdAt: string;
  updatedAt: string;
};

async function validateIncomingAttachment(
  attachment: PropertyManifestV1["attachments"][number],
  expectedSha256: string,
): Promise<ValidatedIncomingAttachment> {
  const encoded = attachment.data.contentBase64;
  if (typeof encoded !== "string") {
    throw new InvalidRequestError(
      `Attachment ${attachment.id} has no embedded private file content.`,
    );
  }
  const bytes = base64ToBytes(encoded);
  if (bytes.byteLength !== attachment.byteLength) {
    throw new InvalidRequestError(
      `Attachment ${attachment.id} does not match its declared size.`,
    );
  }
  const validation = validatePrivateFile({
    fileName: attachment.originalName,
    mimeType: attachment.mediaType,
    sizeBytes: bytes.byteLength,
    header: bytes.subarray(0, 32),
  });
  if (!validation.valid) {
    throw new InvalidRequestError(
      `Attachment ${attachment.id} is invalid: ${validation.issues
        .map((issue) => issue.message)
        .join(" ")}`,
    );
  }
  const checksum = await sha256Hex(bytes);
  if (checksum !== expectedSha256) {
    throw new InvalidRequestError(
      `Attachment ${attachment.id} does not match its checksum.`,
    );
  }
  const data = attachment.data;
  if (attachment.revision < 1) {
    throw new InvalidRequestError(
      `Attachment ${attachment.id} has an invalid revision.`,
    );
  }
  const lifecycleState =
    typeof data.lifecycleState === "string" ? data.lifecycleState : "active";
  if (!["active", "archived", "removed", "planned"].includes(lifecycleState)) {
    throw new InvalidRequestError(
      `Attachment ${attachment.id} has an invalid lifecycle state.`,
    );
  }
  if (typeof data.altText === "string" && data.altText.length > 1_000) {
    throw new InvalidRequestError(
      `Attachment ${attachment.id} has alt text that is too long.`,
    );
  }
  const positiveInteger = (value: unknown, field: string): number | null => {
    if (value == null) return null;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      throw new InvalidRequestError(
        `Attachment ${attachment.id} has an invalid ${field}.`,
      );
    }
    return value;
  };
  return {
    bytes,
    checksum,
    mimeType: validation.mimeType,
    sanitizedName: validation.sanitizedName,
    lifecycleState,
    widthPixels: positiveInteger(data.widthPixels, "widthPixels"),
    heightPixels: positiveInteger(data.heightPixels, "heightPixels"),
    pageCount: positiveInteger(data.pageCount, "pageCount"),
    altText: typeof data.altText === "string" ? data.altText : null,
    createdAt:
      typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
    updatedAt:
      typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}

async function stageAttachment(
  propertyId: string,
  attachment: PropertyManifestV1["attachments"][number],
  expectedSha256: string,
): Promise<StagedAttachment> {
  const validated = await validateIncomingAttachment(
    attachment,
    expectedSha256,
  );
  const objectKey = await createPrivatePropertyFileKey({
    propertyId,
    category: attachmentCategory(attachment.purpose),
  });
  await getPrivateFileStore().put(objectKey, validated.bytes);
  return {
    id: attachment.id,
    objectKey,
    row: {
      id: attachment.id,
      property_id: propertyId,
      owner_type:
        attachment.owner.kind === "property"
          ? "property"
          : attachment.purpose,
      owner_id:
        attachment.owner.kind === "property"
          ? propertyId
          : String(attachment.owner.id).split(":").slice(1).join(":"),
      object_key: objectKey,
      original_file_name: validated.sanitizedName,
      mime_type: validated.mimeType,
      byte_size: validated.bytes.byteLength,
      sha256: validated.checksum,
      width_pixels: validated.widthPixels,
      height_pixels: validated.heightPixels,
      page_count: validated.pageCount,
      alt_text: validated.altText,
      lifecycle_state: validated.lifecycleState,
      revision: attachment.revision,
      created_at: validated.createdAt,
      updated_at: validated.updatedAt,
    },
  };
}

export type ApplyPropertyImportResult = {
  mode: "add" | "merge";
  propertyId: string;
  summary: PropertyImportPreview["summary"];
};

export async function applyOwnedPropertyImport(
  identity: RequestIdentity,
  anchorPropertyId: string,
  incoming: unknown,
  mode: "add" | "merge",
  confirmationToken: string,
): Promise<ApplyPropertyImportResult> {
  const anchor = await requireOwnedProperty(identity, anchorPropertyId);
  const preview = await previewOwnedPropertyImport(
    identity,
    anchorPropertyId,
    incoming,
    mode,
  );
  if (!preview.canApply || !preview.confirmationToken) {
    throw new ConflictError("This import cannot be applied. Review the preview conflicts first.");
  }
  if (confirmationToken !== preview.confirmationToken) {
    throw new ConflictError("The import confirmation does not match the current preview.");
  }
  const validation = await validatePropertyManifest(incoming);
  if (!validation.valid || !validation.manifest) {
    throw new InvalidRequestError("The property manifest is invalid.");
  }
  const manifest = validation.manifest;
  const propertyId = mode === "add" ? manifest.property.id : anchorPropertyId;
  const checksumByAttachment = new Map(
    manifest.checksums.attachments.map((item) => [item.attachmentId, item.sha256]),
  );
  const actionByEntity = new Map(
    preview.outcomes.map((outcome) => [
      `${outcome.entityKind}:${outcome.id}`,
      outcome.action,
    ]),
  );
  const staged: StagedAttachment[] = [];
  let stagedBytes = 0;
  try {
    for (const attachment of manifest.attachments) {
      if (actionByEntity.get(`attachment:${attachment.id}`) !== "create") continue;
      const checksum = checksumByAttachment.get(attachment.id);
      if (!checksum) {
        throw new InvalidRequestError(
          `Attachment ${attachment.id} has no checksum.`,
        );
      }
      const item = await stageAttachment(propertyId, attachment, checksum);
      stagedBytes += Number(item.row.byte_size);
      if (stagedBytes > MAX_IMPORT_ATTACHMENT_BYTES) {
        throw new InvalidRequestError(
          `Imported private files are limited to ${MAX_IMPORT_ATTACHMENT_BYTES} bytes.`,
        );
      }
      staged.push(item);
    }

    const binding = getSqliteConnection();
    const statements: SqlitePreparedStatement[] = [];
    const importedProperty = propertyData(manifest);
    if (mode === "add") {
      statements.push(
        binding
          .prepare(
            "INSERT INTO properties (id, workspace_id, permanent_code, name, address, preferences_json, naming_config_json, lifecycle_state, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            propertyId,
            anchor.workspaceId,
            await nextImportedPropertyCode(anchor.workspaceId),
            importedProperty.name,
            importedProperty.address,
            importedProperty.preferencesJson,
            importedProperty.namingConfigJson,
            importedProperty.lifecycleState,
            manifest.property.revision,
            importedProperty.createdAt,
            importedProperty.updatedAt,
          ),
      );
    } else if (actionByEntity.get(`property:${propertyId}`) === "update") {
      statements.push(
        binding
          .prepare(
            "UPDATE properties SET name = ?, address = ?, preferences_json = ?, naming_config_json = ?, lifecycle_state = ?, revision = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
          )
          .bind(
            importedProperty.name,
            importedProperty.address,
            importedProperty.preferencesJson,
            importedProperty.namingConfigJson,
            importedProperty.lifecycleState,
            manifest.property.revision,
            importedProperty.updatedAt,
            propertyId,
            anchor.workspaceId,
          ),
      );
    }

    for (const attachment of staged) {
      statements.push(insertStatement(binding, "attachments", attachment.row));
    }

    const recordsByKind = new Map<string, typeof manifest.records>();
    for (const record of manifest.records) {
      const records = recordsByKind.get(record.kind) ?? [];
      records.push(record);
      recordsByKind.set(record.kind, records);
    }
    for (const definition of PORTABLE_TABLES) {
      const details = tableDetails(definition);
      for (const record of recordsByKind.get(definition.kind) ?? []) {
        const action = actionByEntity.get(`record:${record.id}`);
        if (action === "unchanged") continue;
        if (action !== "create" && action !== "update") {
          throw new ConflictError(`Record ${record.id} cannot be imported.`);
        }
        const row = rowForImport(definition, record, propertyId);
        await assertRecordIdentity(definition, record, row);
        statements.push(
          action === "create"
            ? insertStatement(binding, details.name, row)
            : updateStatement(
                binding,
                details.name,
                row,
                details.primaryColumns,
              ),
        );
      }
    }
    statements.push(
      binding
        .prepare(
          "INSERT OR IGNORE INTO property_revisions (property_id, data_revision, topology_revision, updated_at) VALUES (?, 0, 0, CURRENT_TIMESTAMP)",
        )
        .bind(propertyId),
      binding
        .prepare(
          "UPDATE property_revisions SET data_revision = data_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE property_id = ?",
        )
        .bind(propertyId),
      binding
        .prepare(
          "INSERT INTO change_events (id, property_id, actor_subject, event_kind, entity_type, entity_id, entity_revision, summary, details_json) VALUES (?, ?, ?, 'import', 'property', ?, ?, 'import property data', ?)"
        )
        .bind(
          crypto.randomUUID(),
          propertyId,
          identity.externalUserId,
          propertyId,
          manifest.property.revision,
          JSON.stringify({ mode, exportId: manifest.exportId }),
        ),
    );
    const results = await binding.batch(statements);
    if (results.some((result) => !result.success)) {
      throw new Error("The property import transaction failed.");
    }
  } catch (error) {
    if (staged.length) {
      await getPrivateFileStore()
        .delete(staged.map((item) => item.objectKey))
        .catch(() => undefined);
    }
    const message = String(error).toLowerCase();
    if (
      !(error instanceof InvalidRequestError) &&
      !(error instanceof ConflictError) &&
      (message.includes("constraint") ||
        message.includes("foreign key") ||
        message.includes("unique"))
    ) {
      throw new ConflictError(
        "The import conflicts with existing data or an invalid relationship; no database changes were applied.",
      );
    }
    throw error;
  }
  return { mode, propertyId, summary: preview.summary };
}
