import { sql, type SQL } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

/**
 * Circuit Atlas persistence schema.
 *
 * All house-specific information is data. This module contains only reusable
 * entity definitions, closed domains, and integrity rules. Every property-owned
 * table carries property_id, and relationships use composite foreign keys so a
 * row cannot silently point into another property.
 */

export const lifecycleStates = ["active", "archived", "removed", "planned"] as const;
export const knowledgeStates = [
  "unknown",
  "assumed",
  "inferred",
  "visually_observed",
  "test_verified",
  "documentation_verified",
  "conflicting",
] as const;
export const assetKinds = [
  "panel",
  "box",
  "device",
  "fixture",
  "appliance",
  "light_source",
  "cable",
  "junction_point",
  "custom",
] as const;
export const smartStates = ["smart", "dumb", "unknown", "not_applicable"] as const;
export const lightColorCapabilities = ["fixed_white", "tunable_white", "full_color", "custom"] as const;
export const installedDeviceDetailKinds = [
  "mac_address",
  "zigbee_ieee",
  "matter_device_id",
  "manufacturer_device_id",
  "setup_code",
  "pairing_code",
  "install_code",
  "onboarding_payload",
  "hub_bridge",
  "ecosystem_name",
  "custom",
] as const;
export const installedDeviceDetailSensitivities = ["ordinary", "identifier", "secret"] as const;
export const deviceKinds = [
  "switch",
  "dimmer",
  "relay",
  "receptacle",
  "gfci_receptacle",
  "sensor",
  "timer",
  "scene_controller",
  "smart_companion",
  "wireless_controller",
  "custom",
] as const;
export const fixtureKinds = ["light", "fan", "fan_light", "integrated_led", "other", "custom"] as const;
export const applianceConnectionKinds = ["hardwired", "plug_connected", "unknown", "custom"] as const;
export const functionKinds = [
  "switch_channel",
  "dimmer_channel",
  "receptacle_half",
  "relay_channel",
  "fixture_light_load",
  "fan_motor",
  "lamp_holder",
  "scene_button",
  "appliance_load",
  "sensor_output",
  "custom",
] as const;
export const panelRoles = ["main", "subpanel", "distribution", "disconnect", "other", "unknown"] as const;
export const panelSides = ["left", "right", "single", "custom"] as const;
export const breakerKinds = [
  "standard",
  "gfci",
  "afci",
  "dual_function",
  "main",
  "tandem",
  "quad",
  "other",
  "unknown",
] as const;
export const phaseLegs = ["L1", "L2", "L3", "N", "unknown", "custom"] as const;
export const circuitSourceRoles = ["line", "phase", "neutral", "other", "unknown"] as const;
export const boxKinds = [
  "device",
  "junction",
  "fixture",
  "panel",
  "floor",
  "weatherproof",
  "other",
  "unknown",
] as const;
export const boxMaterials = ["plastic", "metal", "fiberglass", "other", "unknown"] as const;
export const boxOrientations = ["portrait", "landscape", "square", "custom", "unknown"] as const;
export const boxSides = ["top", "bottom", "left", "right", "back"] as const;
export const wiringMethods = [
  "NM-B",
  "UF-B",
  "MC",
  "AC",
  "FMC",
  "LFMC",
  "EMT",
  "RMC",
  "IMC",
  "conduit",
  "unknown",
  "custom",
] as const;
export const endDesignations = ["A", "B"] as const;
export const conductorKinds = [
  "cable_core",
  "cable_equipment_ground",
  "pigtail",
  "jumper",
  "device_lead",
  "standalone_raceway",
  "unknown",
  "custom",
] as const;
export const conductorMaterials = ["copper", "aluminum", "copper_clad_aluminum", "unknown", "custom"] as const;
export const conductorRoles = [
  "line",
  "load",
  "switched_line",
  "common",
  "traveler_1",
  "traveler_2",
  "neutral",
  "ground",
  "aux",
  "data",
  "unknown",
  "custom",
] as const;
export const terminationMethods = [
  "screw",
  "clamp",
  "backstab",
  "wirenut",
  "lever_connector",
  "crimp",
  "solder",
  "lug",
  "integral",
  "open",
  "unknown",
  "custom",
] as const;
export const electricalNodeKinds = ["terminal", "splice", "open_endpoint", "bond_point", "source", "custom"] as const;
export const terminalRoles = [
  "LINE",
  "LOAD",
  "COMMON",
  "TRAVELER_1",
  "TRAVELER_2",
  "NEUTRAL",
  "GROUND",
  "AUX",
  "MANUFACTURER_SPECIFIC",
  "UNKNOWN",
] as const;
export const internalConnectionKinds = [
  "always_connected",
  "conditional_contact",
  "breakable_tab",
  "load_impedance",
  "transformer_isolation",
  "electronic_signal_only",
  "ground_bond",
] as const;
export const connectionDirections = ["bidirectional", "forward", "reverse"] as const;
export const connectionStates = ["connected", "disconnected", "unknown"] as const;
export const openEndpointKinds = ["capped", "abandoned", "unconnected", "unknown"] as const;
export const controlRoles = ["controller", "companion", "controlled_load"] as const;
export const controlMethods = [
  "mechanical_traveler",
  "wired_auxiliary_data",
  "hardwired_relay",
  "wireless_direct",
  "hub_app",
  "scene_automation",
  "custom",
] as const;
export const upgradeStatuses = ["keep", "investigate", "candidate", "planned", "purchased", "installed", "verified"] as const;
export const upgradeRequirementKinds = [
  "neutral",
  "ground",
  "line_load_identity",
  "box_capacity",
  "multi_way_role",
  "load_compatibility",
  "protocol",
  "hub",
  "custom",
] as const;
export const readinessStates = ["known", "missing", "conflicting", "unknown"] as const;
export const evidenceMethods = [
  "visual_inspection",
  "breaker_test",
  "continuity_test",
  "voltage_test",
  "documentation",
  "photo",
  "user_statement",
  "inference",
  "other",
] as const;
export const changeEventKinds = ["create", "update", "archive", "restore", "replace", "import"] as const;
export const captureDraftStatuses = ["in_progress", "ready_for_review", "completed", "abandoned"] as const;
export const traceGapStatuses = ["open", "resolved", "accepted_unknown"] as const;
export const assertionStatuses = ["active", "superseded", "rejected", "conflicting"] as const;

function enumCheck(column: AnySQLiteColumn, values: readonly string[]): SQL {
  const literals = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
  return sql`${column} in (${sql.raw(literals)})`;
}

const now = sql`CURRENT_TIMESTAMP`;

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    ownerSubject: text("owner_subject").notNull(),
    displayName: text("display_name"),
    preferencesJson: text("preferences_json").notNull().default("{}"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("workspaces_owner_subject_uq").on(table.ownerSubject),
    check("workspaces_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("workspaces_preferences_json_ck", sql`json_valid(${table.preferencesJson})`),
  ],
);

export const properties = sqliteTable(
  "properties",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    permanentCode: text("permanent_code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    preferencesJson: text("preferences_json").notNull().default("{}"),
    namingConfigJson: text("naming_config_json").notNull().default("{}"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("properties_workspace_id_id_uq").on(table.workspaceId, table.id),
    unique("properties_workspace_code_uq").on(table.workspaceId, table.permanentCode),
    index("properties_workspace_state_idx").on(table.workspaceId, table.lifecycleState, table.name),
    check("properties_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("properties_preferences_json_ck", sql`json_valid(${table.preferencesJson})`),
    check("properties_naming_config_json_ck", sql`json_valid(${table.namingConfigJson})`),
    check("properties_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const propertyCodeCounters = sqliteTable(
  "property_code_counters",
  {
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
    codePrefix: text("code_prefix").notNull(),
    nextValue: integer("next_value").notNull().default(1),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.propertyId, table.codePrefix], name: "property_code_counters_pk" }),
    check("property_code_counters_next_value_ck", sql`${table.nextValue} >= 1`),
  ],
);

export const propertyRevisions = sqliteTable(
  "property_revisions",
  {
    propertyId: text("property_id").primaryKey().references(() => properties.id, { onDelete: "restrict" }),
    dataRevision: integer("data_revision").notNull().default(0),
    topologyRevision: integer("topology_revision").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    check("property_revisions_data_ck", sql`${table.dataRevision} >= 0`),
    check("property_revisions_topology_ck", sql`${table.topologyRevision} >= 0`),
  ],
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
    method: text("method", { enum: evidenceMethods }).notNull(),
    knowledgeState: text("knowledge_state", { enum: knowledgeStates }).notNull().default("unknown"),
    confidence: real("confidence"),
    observedAt: text("observed_at"),
    observer: text("observer"),
    notes: text("notes"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("evidence_property_id_id_uq").on(table.propertyId, table.id),
    index("evidence_property_observed_idx").on(table.propertyId, table.observedAt),
    check("evidence_method_ck", enumCheck(table.method, evidenceMethods)),
    check("evidence_knowledge_ck", enumCheck(table.knowledgeState, knowledgeStates)),
    check("evidence_confidence_ck", sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`),
    check("evidence_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
    ownerType: text("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    objectKey: text("object_key").notNull(),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256"),
    widthPixels: integer("width_pixels"),
    heightPixels: integer("height_pixels"),
    pageCount: integer("page_count"),
    altText: text("alt_text"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("attachments_property_id_id_uq").on(table.propertyId, table.id),
    uniqueIndex("attachments_object_key_uq").on(table.objectKey),
    index("attachments_owner_idx").on(table.propertyId, table.ownerType, table.ownerId),
    check("attachments_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("attachments_byte_size_ck", sql`${table.byteSize} >= 0`),
    check("attachments_width_ck", sql`${table.widthPixels} is null or ${table.widthPixels} > 0`),
    check("attachments_height_ck", sql`${table.heightPixels} is null or ${table.heightPixels} > 0`),
    check("attachments_page_count_ck", sql`${table.pageCount} is null or ${table.pageCount} > 0`),
    check("attachments_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const structures = sqliteTable(
  "structures",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("building"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("structures_property_id_id_uq").on(table.propertyId, table.id),
    unique("structures_property_code_uq").on(table.propertyId, table.code),
    index("structures_property_sort_idx").on(table.propertyId, table.sortOrder),
    check("structures_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("structures_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const levels = sqliteTable(
  "levels",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    structureId: text("structure_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    elevationOrder: integer("elevation_order").notNull().default(0),
    notes: text("notes"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("levels_property_id_id_uq").on(table.propertyId, table.id),
    unique("levels_property_structure_code_uq").on(table.propertyId, table.structureId, table.code),
    index("levels_structure_order_idx").on(table.propertyId, table.structureId, table.elevationOrder),
    foreignKey({
      name: "levels_property_structure_fk",
      columns: [table.propertyId, table.structureId],
      foreignColumns: [structures.propertyId, structures.id],
    }).onDelete("restrict"),
    check("levels_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("levels_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const spaces = sqliteTable(
  "spaces",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    levelId: text("level_id").notNull(),
    parentSpaceId: text("parent_space_id"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("room"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("spaces_property_id_id_uq").on(table.propertyId, table.id),
    unique("spaces_property_level_code_uq").on(table.propertyId, table.levelId, table.code),
    index("spaces_level_sort_idx").on(table.propertyId, table.levelId, table.sortOrder),
    foreignKey({
      name: "spaces_property_level_fk",
      columns: [table.propertyId, table.levelId],
      foreignColumns: [levels.propertyId, levels.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "spaces_property_parent_fk",
      columns: [table.propertyId, table.parentSpaceId],
      foreignColumns: [table.propertyId, table.id],
    }).onDelete("restrict"),
    check("spaces_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("spaces_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const wallZones = sqliteTable(
  "wall_zones",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    spaceId: text("space_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    orientation: text("orientation"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("wall_zones_property_id_id_uq").on(table.propertyId, table.id),
    unique("wall_zones_property_space_code_uq").on(table.propertyId, table.spaceId, table.code),
    index("wall_zones_space_sort_idx").on(table.propertyId, table.spaceId, table.sortOrder),
    foreignKey({
      name: "wall_zones_property_space_fk",
      columns: [table.propertyId, table.spaceId],
      foreignColumns: [spaces.propertyId, spaces.id],
    }).onDelete("restrict"),
    check("wall_zones_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("wall_zones_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const floorPlans = sqliteTable(
  "floor_plans",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    levelId: text("level_id").notNull(),
    backgroundAttachmentId: text("background_attachment_id"),
    name: text("name").notNull(),
    pageNumber: integer("page_number"),
    unitsPerPlanUnit: real("units_per_plan_unit"),
    calibrationUnit: text("calibration_unit", { enum: ["in", "ft", "mm", "cm", "m"] }),
    orientationDegrees: real("orientation_degrees").notNull().default(0),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("floor_plans_property_id_id_uq").on(table.propertyId, table.id),
    index("floor_plans_level_idx").on(table.propertyId, table.levelId, table.lifecycleState),
    foreignKey({
      name: "floor_plans_property_level_fk",
      columns: [table.propertyId, table.levelId],
      foreignColumns: [levels.propertyId, levels.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "floor_plans_property_attachment_fk",
      columns: [table.propertyId, table.backgroundAttachmentId],
      foreignColumns: [attachments.propertyId, attachments.id],
    }).onDelete("restrict"),
    check("floor_plans_calibration_unit_ck", sql`${table.calibrationUnit} is null or ${enumCheck(table.calibrationUnit, ["in", "ft", "mm", "cm", "m"])}`),
    check("floor_plans_units_ck", sql`${table.unitsPerPlanUnit} is null or ${table.unitsPerPlanUnit} > 0`),
    check("floor_plans_page_ck", sql`${table.pageNumber} is null or ${table.pageNumber} >= 1`),
    check("floor_plans_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("floor_plans_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
    permanentCode: text("permanent_code").notNull(),
    kind: text("kind", { enum: assetKinds }).notNull(),
    displayName: text("display_name").notNull(),
    notes: text("notes"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("assets_property_id_id_uq").on(table.propertyId, table.id),
    unique("assets_property_permanent_code_uq").on(table.propertyId, table.permanentCode),
    index("assets_property_kind_state_idx").on(table.propertyId, table.kind, table.lifecycleState),
    index("assets_property_name_idx").on(table.propertyId, table.displayName),
    check("assets_kind_ck", enumCheck(table.kind, assetKinds)),
    check("assets_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("assets_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const assetAliases = sqliteTable(
  "asset_aliases",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    assetId: text("asset_id").notNull(),
    alias: text("alias").notNull(),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    unique("asset_aliases_property_id_id_uq").on(table.propertyId, table.id),
    unique("asset_aliases_property_asset_alias_uq").on(table.propertyId, table.assetId, table.alias),
    index("asset_aliases_property_alias_idx").on(table.propertyId, table.alias),
    foreignKey({
      name: "asset_aliases_property_asset_fk",
      columns: [table.propertyId, table.assetId],
      foreignColumns: [assets.propertyId, assets.id],
    }).onDelete("restrict"),
  ],
);

export const assetLocations = sqliteTable(
  "asset_locations",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    assetId: text("asset_id").notNull(),
    structureId: text("structure_id"),
    levelId: text("level_id"),
    spaceId: text("space_id"),
    wallZoneId: text("wall_zone_id"),
    locatorLabel: text("locator_label"),
    height: real("height"),
    heightUnit: text("height_unit", { enum: ["in", "ft", "mm", "cm", "m"] }),
    certainty: text("certainty", { enum: knowledgeStates }).notNull().default("unknown"),
    evidenceId: text("evidence_id"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("asset_locations_property_id_id_uq").on(table.propertyId, table.id),
    unique("asset_locations_property_asset_uq").on(table.propertyId, table.assetId),
    index("asset_locations_room_inventory_idx").on(table.propertyId, table.spaceId, table.assetId),
    foreignKey({ name: "asset_locations_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    foreignKey({ name: "asset_locations_property_structure_fk", columns: [table.propertyId, table.structureId], foreignColumns: [structures.propertyId, structures.id] }).onDelete("restrict"),
    foreignKey({ name: "asset_locations_property_level_fk", columns: [table.propertyId, table.levelId], foreignColumns: [levels.propertyId, levels.id] }).onDelete("restrict"),
    foreignKey({ name: "asset_locations_property_space_fk", columns: [table.propertyId, table.spaceId], foreignColumns: [spaces.propertyId, spaces.id] }).onDelete("restrict"),
    foreignKey({ name: "asset_locations_property_wall_zone_fk", columns: [table.propertyId, table.wallZoneId], foreignColumns: [wallZones.propertyId, wallZones.id] }).onDelete("restrict"),
    foreignKey({ name: "asset_locations_property_evidence_fk", columns: [table.propertyId, table.evidenceId], foreignColumns: [evidence.propertyId, evidence.id] }).onDelete("restrict"),
    check("asset_locations_certainty_ck", enumCheck(table.certainty, knowledgeStates)),
    check("asset_locations_height_unit_ck", sql`${table.heightUnit} is null or ${enumCheck(table.heightUnit, ["in", "ft", "mm", "cm", "m"])}`),
    check("asset_locations_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const planPlacements = sqliteTable(
  "plan_placements",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    floorPlanId: text("floor_plan_id").notNull(),
    assetId: text("asset_id").notNull(),
    xNormalized: real("x_normalized").notNull(),
    yNormalized: real("y_normalized").notNull(),
    rotationDegrees: real("rotation_degrees").notNull().default(0),
    wallOffset: real("wall_offset"),
    height: real("height"),
    heightUnit: text("height_unit", { enum: ["in", "ft", "mm", "cm", "m"] }),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("plan_placements_property_id_id_uq").on(table.propertyId, table.id),
    unique("plan_placements_plan_asset_uq").on(table.propertyId, table.floorPlanId, table.assetId),
    index("plan_placements_plan_idx").on(table.propertyId, table.floorPlanId),
    index("plan_placements_asset_idx").on(table.propertyId, table.assetId),
    foreignKey({ name: "plan_placements_property_plan_fk", columns: [table.propertyId, table.floorPlanId], foreignColumns: [floorPlans.propertyId, floorPlans.id] }).onDelete("restrict"),
    foreignKey({ name: "plan_placements_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("plan_placements_x_ck", sql`${table.xNormalized} >= 0 and ${table.xNormalized} <= 1`),
    check("plan_placements_y_ck", sql`${table.yNormalized} >= 0 and ${table.yNormalized} <= 1`),
    check("plan_placements_wall_offset_ck", sql`${table.wallOffset} is null or (${table.wallOffset} >= 0 and ${table.wallOffset} <= 1)`),
    check("plan_placements_height_unit_ck", sql`${table.heightUnit} is null or ${enumCheck(table.heightUnit, ["in", "ft", "mm", "cm", "m"])}`),
    check("plan_placements_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const productModels = sqliteTable(
  "product_models",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
    manufacturer: text("manufacturer"),
    model: text("model").notNull(),
    category: text("category").notNull(),
    sku: text("sku"),
    smartState: text("smart_state", { enum: smartStates }).notNull().default("unknown"),
    protocolsJson: text("protocols_json").notNull().default("[]"),
    capabilitiesJson: text("capabilities_json").notNull().default("{}"),
    requirementsJson: text("requirements_json").notNull().default("{}"),
    notes: text("notes"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("product_models_property_id_id_uq").on(table.propertyId, table.id),
    index("product_models_property_category_idx").on(table.propertyId, table.category, table.manufacturer, table.model),
    check("product_models_smart_state_ck", enumCheck(table.smartState, smartStates)),
    check("product_models_protocols_json_ck", sql`json_valid(${table.protocolsJson})`),
    check("product_models_capabilities_json_ck", sql`json_valid(${table.capabilitiesJson})`),
    check("product_models_requirements_json_ck", sql`json_valid(${table.requirementsJson})`),
    check("product_models_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("product_models_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const installedProducts = sqliteTable(
  "installed_products",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    assetId: text("asset_id").notNull(),
    productModelId: text("product_model_id"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    sku: text("sku"),
    serialNumber: text("serial_number"),
    hardwareRevision: text("hardware_revision"),
    firmwareVersion: text("firmware_version"),
    smartState: text("smart_state", { enum: smartStates }).notNull().default("unknown"),
    capabilitiesJson: text("capabilities_json").notNull().default("{}"),
    installedAt: text("installed_at"),
    removedAt: text("removed_at"),
    notes: text("notes"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("installed_products_property_id_id_uq").on(table.propertyId, table.id),
    index("installed_products_asset_state_idx").on(table.propertyId, table.assetId, table.lifecycleState),
    foreignKey({ name: "installed_products_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    foreignKey({ name: "installed_products_property_model_fk", columns: [table.propertyId, table.productModelId], foreignColumns: [productModels.propertyId, productModels.id] }).onDelete("restrict"),
    check("installed_products_smart_state_ck", enumCheck(table.smartState, smartStates)),
    check("installed_products_capabilities_json_ck", sql`json_valid(${table.capabilitiesJson})`),
    check("installed_products_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("installed_products_dates_ck", sql`${table.removedAt} is null or ${table.installedAt} is null or ${table.removedAt} >= ${table.installedAt}`),
    check("installed_products_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const installedDeviceDetails = sqliteTable(
  "installed_device_details",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    installedProductId: text("installed_product_id").notNull(),
    kind: text("kind", { enum: installedDeviceDetailKinds }).notNull(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value"),
    sensitivity: text("sensitivity", { enum: installedDeviceDetailSensitivities }).notNull().default("identifier"),
    notes: text("notes"),
    verificationState: text("verification_state", { enum: knowledgeStates }).notNull().default("unknown"),
    verifiedAt: text("verified_at"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("installed_device_details_property_id_id_uq").on(table.propertyId, table.id),
    index("installed_device_details_product_state_idx").on(table.propertyId, table.installedProductId, table.lifecycleState),
    index("installed_device_details_identifier_idx").on(table.propertyId, table.sensitivity, table.normalizedValue),
    foreignKey({
      name: "installed_device_details_property_product_fk",
      columns: [table.propertyId, table.installedProductId],
      foreignColumns: [installedProducts.propertyId, installedProducts.id],
    }).onDelete("restrict"),
    check("installed_device_details_kind_ck", enumCheck(table.kind, installedDeviceDetailKinds)),
    check("installed_device_details_sensitivity_ck", enumCheck(table.sensitivity, installedDeviceDetailSensitivities)),
    check("installed_device_details_secret_normalized_ck", sql`${table.sensitivity} <> 'secret' or ${table.normalizedValue} is null`),
    check("installed_device_details_label_ck", sql`length(trim(${table.label})) > 0`),
    check("installed_device_details_value_ck", sql`length(${table.value}) > 0`),
    check("installed_device_details_verification_ck", enumCheck(table.verificationState, knowledgeStates)),
    check("installed_device_details_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("installed_device_details_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const devices = sqliteTable(
  "devices",
  {
    assetId: text("asset_id").primaryKey(),
    propertyId: text("property_id").notNull(),
    deviceKind: text("device_kind", { enum: deviceKinds }).notNull(),
    smartState: text("smart_state", { enum: smartStates }).notNull().default("unknown"),
    protocol: text("protocol"),
    configurationLabel: text("configuration_label"),
  },
  (table) => [
    unique("devices_property_asset_uq").on(table.propertyId, table.assetId),
    index("devices_property_kind_idx").on(table.propertyId, table.deviceKind, table.smartState),
    foreignKey({ name: "devices_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("devices_kind_ck", enumCheck(table.deviceKind, deviceKinds)),
    check("devices_smart_state_ck", enumCheck(table.smartState, smartStates)),
  ],
);

export const fixtures = sqliteTable(
  "fixtures",
  {
    assetId: text("asset_id").primaryKey(),
    propertyId: text("property_id").notNull(),
    fixtureKind: text("fixture_kind", { enum: fixtureKinds }).notNull(),
    smartState: text("smart_state", { enum: smartStates }).notNull().default("unknown"),
    integratedLightSource: integer("integrated_light_source", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    unique("fixtures_property_asset_uq").on(table.propertyId, table.assetId),
    index("fixtures_property_kind_idx").on(table.propertyId, table.fixtureKind, table.smartState),
    foreignKey({ name: "fixtures_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("fixtures_kind_ck", enumCheck(table.fixtureKind, fixtureKinds)),
    check("fixtures_smart_state_ck", enumCheck(table.smartState, smartStates)),
  ],
);

export const appliances = sqliteTable(
  "appliances",
  {
    assetId: text("asset_id").primaryKey(),
    propertyId: text("property_id").notNull(),
    connectionKind: text("connection_kind", { enum: applianceConnectionKinds }).notNull().default("unknown"),
    smartState: text("smart_state", { enum: smartStates }).notNull().default("unknown"),
    ratedWatts: real("rated_watts"),
  },
  (table) => [
    unique("appliances_property_asset_uq").on(table.propertyId, table.assetId),
    foreignKey({ name: "appliances_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("appliances_connection_kind_ck", enumCheck(table.connectionKind, applianceConnectionKinds)),
    check("appliances_smart_state_ck", enumCheck(table.smartState, smartStates)),
    check("appliances_watts_ck", sql`${table.ratedWatts} is null or ${table.ratedWatts} >= 0`),
  ],
);

export const assetFunctions = sqliteTable(
  "asset_functions",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    assetId: text("asset_id").notNull(),
    functionKey: text("function_key").notNull(),
    kind: text("kind", { enum: functionKinds }).notNull(),
    displayName: text("display_name").notNull(),
    channelNumber: integer("channel_number"),
    notes: text("notes"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("asset_functions_property_id_id_uq").on(table.propertyId, table.id),
    unique("asset_functions_property_asset_id_uq").on(table.propertyId, table.assetId, table.id),
    unique("asset_functions_property_asset_key_uq").on(table.propertyId, table.assetId, table.functionKey),
    index("asset_functions_asset_kind_idx").on(table.propertyId, table.assetId, table.kind),
    foreignKey({ name: "asset_functions_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("asset_functions_kind_ck", enumCheck(table.kind, functionKinds)),
    check("asset_functions_channel_ck", sql`${table.channelNumber} is null or ${table.channelNumber} >= 1`),
    check("asset_functions_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("asset_functions_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const lampHolders = sqliteTable(
  "lamp_holders",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    fixtureAssetId: text("fixture_asset_id").notNull(),
    assetFunctionId: text("asset_function_id"),
    positionKey: text("position_key").notNull(),
    baseType: text("base_type"),
    lampShape: text("lamp_shape"),
    maxWatts: real("max_watts"),
    notes: text("notes"),
  },
  (table) => [
    unique("lamp_holders_property_id_id_uq").on(table.propertyId, table.id),
    unique("lamp_holders_property_fixture_id_uq").on(table.propertyId, table.fixtureAssetId, table.id),
    unique("lamp_holders_fixture_position_uq").on(table.propertyId, table.fixtureAssetId, table.positionKey),
    foreignKey({ name: "lamp_holders_property_fixture_fk", columns: [table.propertyId, table.fixtureAssetId], foreignColumns: [fixtures.propertyId, fixtures.assetId] }).onDelete("restrict"),
    foreignKey({ name: "lamp_holders_property_function_fk", columns: [table.propertyId, table.fixtureAssetId, table.assetFunctionId], foreignColumns: [assetFunctions.propertyId, assetFunctions.assetId, assetFunctions.id] }).onDelete("restrict"),
    check("lamp_holders_max_watts_ck", sql`${table.maxWatts} is null or ${table.maxWatts} >= 0`),
  ],
);

export const lightSources = sqliteTable(
  "light_sources",
  {
    assetId: text("asset_id").primaryKey(),
    propertyId: text("property_id").notNull(),
    fixtureAssetId: text("fixture_asset_id").notNull(),
    lampHolderId: text("lamp_holder_id"),
    technology: text("technology"),
    bulbType: text("bulb_type"),
    baseType: text("base_type"),
    watts: real("watts"),
    equivalentWatts: real("equivalent_watts"),
    lumens: real("lumens"),
    colorTemperatureKelvin: integer("color_temperature_kelvin"),
    colorTemperatureMinKelvin: integer("color_temperature_min_kelvin"),
    colorTemperatureMaxKelvin: integer("color_temperature_max_kelvin"),
    colorCapability: text("color_capability", { enum: lightColorCapabilities }),
    dimmable: integer("dimmable", { mode: "boolean" }),
    smartState: text("smart_state", { enum: smartStates }).notNull().default("unknown"),
    integrated: integer("integrated", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    unique("light_sources_property_asset_uq").on(table.propertyId, table.assetId),
    index("light_sources_fixture_idx").on(table.propertyId, table.fixtureAssetId),
    foreignKey({ name: "light_sources_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    foreignKey({ name: "light_sources_property_fixture_fk", columns: [table.propertyId, table.fixtureAssetId], foreignColumns: [fixtures.propertyId, fixtures.assetId] }).onDelete("restrict"),
    foreignKey({ name: "light_sources_property_holder_fk", columns: [table.propertyId, table.fixtureAssetId, table.lampHolderId], foreignColumns: [lampHolders.propertyId, lampHolders.fixtureAssetId, lampHolders.id] }).onDelete("restrict"),
    check("light_sources_smart_state_ck", enumCheck(table.smartState, smartStates)),
    check("light_sources_watts_ck", sql`${table.watts} is null or ${table.watts} >= 0`),
    check("light_sources_equivalent_watts_ck", sql`${table.equivalentWatts} is null or ${table.equivalentWatts} >= 0`),
    check("light_sources_lumens_ck", sql`${table.lumens} is null or ${table.lumens} >= 0`),
    check("light_sources_kelvin_ck", sql`${table.colorTemperatureKelvin} is null or ${table.colorTemperatureKelvin} > 0`),
    check("light_sources_min_kelvin_ck", sql`${table.colorTemperatureMinKelvin} is null or ${table.colorTemperatureMinKelvin} > 0`),
    check("light_sources_max_kelvin_ck", sql`${table.colorTemperatureMaxKelvin} is null or ${table.colorTemperatureMaxKelvin} > 0`),
    check("light_sources_kelvin_range_ck", sql`${table.colorTemperatureMinKelvin} is null or ${table.colorTemperatureMaxKelvin} is null or ${table.colorTemperatureMaxKelvin} >= ${table.colorTemperatureMinKelvin}`),
    check("light_sources_color_capability_ck", sql`${table.colorCapability} is null or ${enumCheck(table.colorCapability, lightColorCapabilities)}`),
  ],
);

export const plugConnections = sqliteTable(
  "plug_connections",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    applianceAssetId: text("appliance_asset_id").notNull(),
    receptacleFunctionId: text("receptacle_function_id").notNull(),
    connectedAt: text("connected_at").notNull().default(now),
    disconnectedAt: text("disconnected_at"),
    notes: text("notes"),
  },
  (table) => [
    unique("plug_connections_property_id_id_uq").on(table.propertyId, table.id),
    index("plug_connections_appliance_idx").on(table.propertyId, table.applianceAssetId, table.disconnectedAt),
    index("plug_connections_receptacle_idx").on(table.propertyId, table.receptacleFunctionId, table.disconnectedAt),
    foreignKey({ name: "plug_connections_property_appliance_fk", columns: [table.propertyId, table.applianceAssetId], foreignColumns: [appliances.propertyId, appliances.assetId] }).onDelete("restrict"),
    foreignKey({ name: "plug_connections_property_function_fk", columns: [table.propertyId, table.receptacleFunctionId], foreignColumns: [assetFunctions.propertyId, assetFunctions.id] }).onDelete("restrict"),
    check("plug_connections_dates_ck", sql`${table.disconnectedAt} is null or ${table.disconnectedAt} >= ${table.connectedAt}`),
  ],
);

export const panels = sqliteTable(
  "panels",
  {
    assetId: text("asset_id").primaryKey(),
    propertyId: text("property_id").notNull(),
    role: text("role", { enum: panelRoles }).notNull().default("unknown"),
    nominalVoltage: integer("nominal_voltage"),
    phaseCount: integer("phase_count"),
    maxAmps: integer("max_amps"),
    systemNotes: text("system_notes"),
  },
  (table) => [
    unique("panels_property_asset_uq").on(table.propertyId, table.assetId),
    foreignKey({ name: "panels_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("panels_role_ck", enumCheck(table.role, panelRoles)),
    check("panels_voltage_ck", sql`${table.nominalVoltage} is null or ${table.nominalVoltage} > 0`),
    check("panels_phase_count_ck", sql`${table.phaseCount} is null or ${table.phaseCount} > 0`),
    check("panels_max_amps_ck", sql`${table.maxAmps} is null or ${table.maxAmps} > 0`),
  ],
);

export const panelPositions = sqliteTable(
  "panel_positions",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    panelAssetId: text("panel_asset_id").notNull(),
    slotNumber: integer("slot_number").notNull(),
    side: text("side", { enum: panelSides }).notNull().default("single"),
    columnLabel: text("column_label"),
    tandemSubposition: text("tandem_subposition").notNull().default("full"),
    label: text("label"),
  },
  (table) => [
    unique("panel_positions_property_id_id_uq").on(table.propertyId, table.id),
    unique("panel_positions_property_panel_id_uq").on(table.propertyId, table.panelAssetId, table.id),
    unique("panel_positions_slot_uq").on(table.propertyId, table.panelAssetId, table.slotNumber, table.side, table.tandemSubposition),
    index("panel_positions_panel_slot_idx").on(table.propertyId, table.panelAssetId, table.slotNumber),
    foreignKey({ name: "panel_positions_property_panel_fk", columns: [table.propertyId, table.panelAssetId], foreignColumns: [panels.propertyId, panels.assetId] }).onDelete("restrict"),
    check("panel_positions_slot_ck", sql`${table.slotNumber} >= 1`),
    check("panel_positions_side_ck", enumCheck(table.side, panelSides)),
  ],
);

export const breakers = sqliteTable(
  "breakers",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    panelAssetId: text("panel_asset_id").notNull(),
    permanentCode: text("permanent_code").notNull(),
    label: text("label").notNull(),
    ratingAmps: integer("rating_amps"),
    poleCount: integer("pole_count").notNull().default(1),
    kind: text("kind", { enum: breakerKinds }).notNull().default("unknown"),
    hasAfci: integer("has_afci", { mode: "boolean" }).notNull().default(false),
    hasGfci: integer("has_gfci", { mode: "boolean" }).notNull().default(false),
    handleTieGroup: text("handle_tie_group"),
    notes: text("notes"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("breakers_property_id_id_uq").on(table.propertyId, table.id),
    unique("breakers_property_panel_id_uq").on(table.propertyId, table.panelAssetId, table.id),
    unique("breakers_property_code_uq").on(table.propertyId, table.permanentCode),
    index("breakers_panel_state_idx").on(table.propertyId, table.panelAssetId, table.lifecycleState),
    foreignKey({ name: "breakers_property_panel_fk", columns: [table.propertyId, table.panelAssetId], foreignColumns: [panels.propertyId, panels.assetId] }).onDelete("restrict"),
    check("breakers_rating_ck", sql`${table.ratingAmps} is null or ${table.ratingAmps} > 0`),
    check("breakers_pole_count_ck", sql`${table.poleCount} >= 1`),
    check("breakers_kind_ck", enumCheck(table.kind, breakerKinds)),
    check("breakers_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("breakers_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const breakerPoles = sqliteTable(
  "breaker_poles",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    panelAssetId: text("panel_asset_id").notNull(),
    breakerId: text("breaker_id").notNull(),
    panelPositionId: text("panel_position_id").notNull(),
    poleIndex: integer("pole_index").notNull(),
    phaseLeg: text("phase_leg", { enum: phaseLegs }).notNull().default("unknown"),
    notes: text("notes"),
  },
  (table) => [
    unique("breaker_poles_property_id_id_uq").on(table.propertyId, table.id),
    unique("breaker_poles_breaker_index_uq").on(table.propertyId, table.breakerId, table.poleIndex),
    unique("breaker_poles_position_uq").on(table.propertyId, table.panelPositionId),
    index("breaker_poles_panel_idx").on(table.propertyId, table.panelAssetId, table.panelPositionId),
    foreignKey({ name: "breaker_poles_property_breaker_fk", columns: [table.propertyId, table.panelAssetId, table.breakerId], foreignColumns: [breakers.propertyId, breakers.panelAssetId, breakers.id] }).onDelete("restrict"),
    foreignKey({ name: "breaker_poles_property_position_fk", columns: [table.propertyId, table.panelAssetId, table.panelPositionId], foreignColumns: [panelPositions.propertyId, panelPositions.panelAssetId, panelPositions.id] }).onDelete("restrict"),
    check("breaker_poles_index_ck", sql`${table.poleIndex} >= 1`),
    check("breaker_poles_phase_leg_ck", enumCheck(table.phaseLeg, phaseLegs)),
  ],
);

export const circuits = sqliteTable(
  "circuits",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
    permanentCode: text("permanent_code").notNull(),
    name: text("name").notNull(),
    nominalVoltage: integer("nominal_voltage"),
    purpose: text("purpose"),
    notes: text("notes"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("circuits_property_id_id_uq").on(table.propertyId, table.id),
    unique("circuits_property_code_uq").on(table.propertyId, table.permanentCode),
    index("circuits_property_state_idx").on(table.propertyId, table.lifecycleState, table.name),
    check("circuits_voltage_ck", sql`${table.nominalVoltage} is null or ${table.nominalVoltage} > 0`),
    check("circuits_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("circuits_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const panelFeeders = sqliteTable(
  "panel_feeders",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    upstreamCircuitId: text("upstream_circuit_id").notNull(),
    downstreamPanelAssetId: text("downstream_panel_asset_id").notNull(),
    notes: text("notes"),
  },
  (table) => [
    unique("panel_feeders_property_id_id_uq").on(table.propertyId, table.id),
    unique("panel_feeders_downstream_panel_uq").on(table.propertyId, table.downstreamPanelAssetId),
    index("panel_feeders_upstream_idx").on(table.propertyId, table.upstreamCircuitId),
    foreignKey({ name: "panel_feeders_property_circuit_fk", columns: [table.propertyId, table.upstreamCircuitId], foreignColumns: [circuits.propertyId, circuits.id] }).onDelete("restrict"),
    foreignKey({ name: "panel_feeders_property_panel_fk", columns: [table.propertyId, table.downstreamPanelAssetId], foreignColumns: [panels.propertyId, panels.assetId] }).onDelete("restrict"),
  ],
);

export const boxes = sqliteTable(
  "boxes",
  {
    assetId: text("asset_id").primaryKey(),
    propertyId: text("property_id").notNull(),
    boxKind: text("box_kind", { enum: boxKinds }).notNull().default("unknown"),
    material: text("material", { enum: boxMaterials }).notNull().default("unknown"),
    gangCount: integer("gang_count").notNull().default(1),
    orientation: text("orientation", { enum: boxOrientations }).notNull().default("unknown"),
    width: real("width"),
    height: real("height"),
    depth: real("depth"),
    dimensionUnit: text("dimension_unit", { enum: ["in", "mm", "cm"] }),
  },
  (table) => [
    unique("boxes_property_asset_uq").on(table.propertyId, table.assetId),
    index("boxes_property_gang_idx").on(table.propertyId, table.gangCount),
    foreignKey({ name: "boxes_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("boxes_kind_ck", enumCheck(table.boxKind, boxKinds)),
    check("boxes_material_ck", enumCheck(table.material, boxMaterials)),
    check("boxes_gang_count_ck", sql`${table.gangCount} >= 1`),
    check("boxes_orientation_ck", enumCheck(table.orientation, boxOrientations)),
    check("boxes_width_ck", sql`${table.width} is null or ${table.width} > 0`),
    check("boxes_height_ck", sql`${table.height} is null or ${table.height} > 0`),
    check("boxes_depth_ck", sql`${table.depth} is null or ${table.depth} > 0`),
    check("boxes_dimension_unit_ck", sql`${table.dimensionUnit} is null or ${enumCheck(table.dimensionUnit, ["in", "mm", "cm"])}`),
  ],
);

export const boxPorts = sqliteTable(
  "box_ports",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    boxAssetId: text("box_asset_id").notNull(),
    side: text("side", { enum: boxSides }).notNull(),
    offsetNormalized: real("offset_normalized").notNull().default(0.5),
    knockoutLabel: text("knockout_label"),
    notes: text("notes"),
  },
  (table) => [
    unique("box_ports_property_id_id_uq").on(table.propertyId, table.id),
    unique("box_ports_property_box_id_uq").on(table.propertyId, table.boxAssetId, table.id),
    index("box_ports_box_side_idx").on(table.propertyId, table.boxAssetId, table.side, table.offsetNormalized),
    foreignKey({ name: "box_ports_property_box_fk", columns: [table.propertyId, table.boxAssetId], foreignColumns: [boxes.propertyId, boxes.assetId] }).onDelete("restrict"),
    check("box_ports_side_ck", enumCheck(table.side, boxSides)),
    check("box_ports_offset_ck", sql`${table.offsetNormalized} >= 0 and ${table.offsetNormalized} <= 1`),
  ],
);

export const assetMounts = sqliteTable(
  "asset_mounts",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    boxAssetId: text("box_asset_id").notNull(),
    mountedAssetId: text("mounted_asset_id").notNull(),
    startGangIndex: integer("start_gang_index").notNull(),
    gangSpan: integer("gang_span").notNull().default(1),
    verticalPosition: real("vertical_position").notNull().default(0.5),
    rotationDegrees: real("rotation_degrees").notNull().default(0),
    faceLabel: text("face_label"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("asset_mounts_property_id_id_uq").on(table.propertyId, table.id),
    unique("asset_mounts_property_box_id_uq").on(table.propertyId, table.boxAssetId, table.id),
    unique("asset_mounts_asset_uq").on(table.propertyId, table.mountedAssetId),
    index("asset_mounts_box_idx").on(table.propertyId, table.boxAssetId, table.startGangIndex),
    foreignKey({ name: "asset_mounts_property_box_fk", columns: [table.propertyId, table.boxAssetId], foreignColumns: [boxes.propertyId, boxes.assetId] }).onDelete("restrict"),
    foreignKey({ name: "asset_mounts_property_asset_fk", columns: [table.propertyId, table.mountedAssetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("asset_mounts_start_gang_ck", sql`${table.startGangIndex} >= 1`),
    check("asset_mounts_gang_span_ck", sql`${table.gangSpan} >= 1`),
    check("asset_mounts_vertical_ck", sql`${table.verticalPosition} >= 0 and ${table.verticalPosition} <= 1`),
    check("asset_mounts_revision_ck", sql`${table.revision} >= 1`),
  ],
);

/** One row per occupied gang makes overlap prevention enforceable in SQLite. */
export const assetMountPositions = sqliteTable(
  "asset_mount_positions",
  {
    propertyId: text("property_id").notNull(),
    mountId: text("mount_id").notNull(),
    boxAssetId: text("box_asset_id").notNull(),
    gangIndex: integer("gang_index").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.propertyId, table.mountId, table.gangIndex], name: "asset_mount_positions_pk" }),
    unique("asset_mount_positions_box_gang_uq").on(table.propertyId, table.boxAssetId, table.gangIndex),
    foreignKey({ name: "asset_mount_positions_property_mount_fk", columns: [table.propertyId, table.boxAssetId, table.mountId], foreignColumns: [assetMounts.propertyId, assetMounts.boxAssetId, assetMounts.id] }).onDelete("restrict"),
    check("asset_mount_positions_gang_ck", sql`${table.gangIndex} >= 1`),
  ],
);

export const diagramAnnotations = sqliteTable(
  "diagram_annotations",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    boxAssetId: text("box_asset_id").notNull(),
    anchorType: text("anchor_type").notNull(),
    anchorId: text("anchor_id"),
    xNormalized: real("x_normalized"),
    yNormalized: real("y_normalized"),
    text: text("text").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    unique("diagram_annotations_property_id_id_uq").on(table.propertyId, table.id),
    index("diagram_annotations_box_idx").on(table.propertyId, table.boxAssetId, table.sortOrder),
    foreignKey({ name: "diagram_annotations_property_box_fk", columns: [table.propertyId, table.boxAssetId], foreignColumns: [boxes.propertyId, boxes.assetId] }).onDelete("restrict"),
    check("diagram_annotations_x_ck", sql`${table.xNormalized} is null or (${table.xNormalized} >= 0 and ${table.xNormalized} <= 1)`),
    check("diagram_annotations_y_ck", sql`${table.yNormalized} is null or (${table.yNormalized} >= 0 and ${table.yNormalized} <= 1)`),
  ],
);

export const cables = sqliteTable(
  "cables",
  {
    assetId: text("asset_id").primaryKey(),
    propertyId: text("property_id").notNull(),
    wiringMethod: text("wiring_method", { enum: wiringMethods }).notNull().default("unknown"),
    customWiringMethod: text("custom_wiring_method"),
    jacketMarking: text("jacket_marking"),
    insulatedConductorCount: integer("insulated_conductor_count"),
    equipmentGroundCount: integer("equipment_ground_count"),
    gauge: text("gauge"),
    notes: text("notes"),
  },
  (table) => [
    unique("cables_property_asset_uq").on(table.propertyId, table.assetId),
    index("cables_property_method_idx").on(table.propertyId, table.wiringMethod),
    foreignKey({ name: "cables_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("cables_wiring_method_ck", enumCheck(table.wiringMethod, wiringMethods)),
    check("cables_custom_method_ck", sql`${table.wiringMethod} <> 'custom' or length(trim(${table.customWiringMethod})) > 0`),
    check("cables_insulated_count_ck", sql`${table.insulatedConductorCount} is null or ${table.insulatedConductorCount} >= 0`),
    check("cables_ground_count_ck", sql`${table.equipmentGroundCount} is null or ${table.equipmentGroundCount} >= 0`),
  ],
);

export const cableEnds = sqliteTable(
  "cable_ends",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    cableAssetId: text("cable_asset_id").notNull(),
    designation: text("designation", { enum: endDesignations }).notNull(),
    boxAssetId: text("box_asset_id"),
    endpointAssetId: text("endpoint_asset_id"),
    boxPortId: text("box_port_id"),
    certainty: text("certainty", { enum: knowledgeStates }).notNull().default("unknown"),
    notes: text("notes"),
  },
  (table) => [
    unique("cable_ends_property_id_id_uq").on(table.propertyId, table.id),
    unique("cable_ends_cable_designation_uq").on(table.propertyId, table.cableAssetId, table.designation),
    index("cable_ends_box_idx").on(table.propertyId, table.boxAssetId),
    index("cable_ends_endpoint_asset_idx").on(table.propertyId, table.endpointAssetId),
    foreignKey({ name: "cable_ends_property_cable_fk", columns: [table.propertyId, table.cableAssetId], foreignColumns: [cables.propertyId, cables.assetId] }).onDelete("restrict"),
    foreignKey({ name: "cable_ends_property_box_fk", columns: [table.propertyId, table.boxAssetId], foreignColumns: [boxes.propertyId, boxes.assetId] }).onDelete("restrict"),
    foreignKey({ name: "cable_ends_property_endpoint_asset_fk", columns: [table.propertyId, table.endpointAssetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    foreignKey({ name: "cable_ends_property_port_fk", columns: [table.propertyId, table.boxAssetId, table.boxPortId], foreignColumns: [boxPorts.propertyId, boxPorts.boxAssetId, boxPorts.id] }).onDelete("restrict"),
    check("cable_ends_designation_ck", enumCheck(table.designation, endDesignations)),
    check("cable_ends_certainty_ck", enumCheck(table.certainty, knowledgeStates)),
    check("cable_ends_port_requires_box_ck", sql`${table.boxPortId} is null or ${table.boxAssetId} is not null`),
  ],
);

export const conductors = sqliteTable(
  "conductors",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    permanentCode: text("permanent_code").notNull(),
    cableAssetId: text("cable_asset_id"),
    kind: text("kind", { enum: conductorKinds }).notNull(),
    coreIndex: integer("core_index"),
    observedInsulationColor: text("observed_insulation_color"),
    reidentificationMarking: text("reidentification_marking"),
    gauge: text("gauge"),
    material: text("material", { enum: conductorMaterials }),
    observedRole: text("observed_role", { enum: conductorRoles }),
    assignedRole: text("assigned_role", { enum: conductorRoles }),
    notes: text("notes"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("conductors_property_id_id_uq").on(table.propertyId, table.id),
    unique("conductors_property_code_uq").on(table.propertyId, table.permanentCode),
    unique("conductors_cable_core_index_uq").on(table.propertyId, table.cableAssetId, table.coreIndex),
    index("conductors_cable_idx").on(table.propertyId, table.cableAssetId, table.kind),
    foreignKey({ name: "conductors_property_cable_fk", columns: [table.propertyId, table.cableAssetId], foreignColumns: [cables.propertyId, cables.assetId] }).onDelete("restrict"),
    check("conductors_kind_ck", enumCheck(table.kind, conductorKinds)),
    check("conductors_core_index_ck", sql`${table.coreIndex} is null or ${table.coreIndex} >= 1`),
    check("conductors_material_ck", sql`${table.material} is null or ${enumCheck(table.material, conductorMaterials)}`),
    check("conductors_observed_role_ck", sql`${table.observedRole} is null or ${enumCheck(table.observedRole, conductorRoles)}`),
    check("conductors_assigned_role_ck", sql`${table.assignedRole} is null or ${enumCheck(table.assignedRole, conductorRoles)}`),
    check("conductors_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("conductors_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const electricalNodes = sqliteTable(
  "electrical_nodes",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    kind: text("kind", { enum: electricalNodeKinds }).notNull(),
    containingBoxAssetId: text("containing_box_asset_id"),
    containingAssetId: text("containing_asset_id"),
    label: text("label"),
    certainty: text("certainty", { enum: knowledgeStates }).notNull().default("unknown"),
    notes: text("notes"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("electrical_nodes_property_id_id_uq").on(table.propertyId, table.id),
    index("electrical_nodes_box_idx").on(table.propertyId, table.containingBoxAssetId, table.kind),
    index("electrical_nodes_asset_idx").on(table.propertyId, table.containingAssetId, table.kind),
    foreignKey({ name: "electrical_nodes_property_box_fk", columns: [table.propertyId, table.containingBoxAssetId], foreignColumns: [boxes.propertyId, boxes.assetId] }).onDelete("restrict"),
    foreignKey({ name: "electrical_nodes_property_asset_fk", columns: [table.propertyId, table.containingAssetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("electrical_nodes_kind_ck", enumCheck(table.kind, electricalNodeKinds)),
    check("electrical_nodes_certainty_ck", enumCheck(table.certainty, knowledgeStates)),
    check("electrical_nodes_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("electrical_nodes_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const terminals = sqliteTable(
  "terminals",
  {
    electricalNodeId: text("electrical_node_id").primaryKey(),
    propertyId: text("property_id").notNull(),
    owningAssetId: text("owning_asset_id").notNull(),
    assetFunctionId: text("asset_function_id"),
    terminalKey: text("terminal_key").notNull(),
    manufacturerLabel: text("manufacturer_label"),
    semanticRole: text("semantic_role", { enum: terminalRoles }).notNull().default("UNKNOWN"),
    terminalGroup: text("terminal_group"),
    notes: text("notes"),
  },
  (table) => [
    unique("terminals_property_node_uq").on(table.propertyId, table.electricalNodeId),
    unique("terminals_asset_key_uq").on(table.propertyId, table.owningAssetId, table.terminalKey),
    index("terminals_asset_idx").on(table.propertyId, table.owningAssetId, table.assetFunctionId),
    foreignKey({ name: "terminals_property_node_fk", columns: [table.propertyId, table.electricalNodeId], foreignColumns: [electricalNodes.propertyId, electricalNodes.id] }).onDelete("restrict"),
    foreignKey({ name: "terminals_property_asset_fk", columns: [table.propertyId, table.owningAssetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    foreignKey({ name: "terminals_property_function_fk", columns: [table.propertyId, table.owningAssetId, table.assetFunctionId], foreignColumns: [assetFunctions.propertyId, assetFunctions.assetId, assetFunctions.id] }).onDelete("restrict"),
    check("terminals_semantic_role_ck", enumCheck(table.semanticRole, terminalRoles)),
  ],
);

export const splices = sqliteTable(
  "splices",
  {
    electricalNodeId: text("electrical_node_id").primaryKey(),
    propertyId: text("property_id").notNull(),
    boxAssetId: text("box_asset_id").notNull(),
    connectorType: text("connector_type"),
    label: text("label"),
  },
  (table) => [
    unique("splices_property_node_uq").on(table.propertyId, table.electricalNodeId),
    index("splices_box_idx").on(table.propertyId, table.boxAssetId),
    foreignKey({ name: "splices_property_node_fk", columns: [table.propertyId, table.electricalNodeId], foreignColumns: [electricalNodes.propertyId, electricalNodes.id] }).onDelete("restrict"),
    foreignKey({ name: "splices_property_box_fk", columns: [table.propertyId, table.boxAssetId], foreignColumns: [boxes.propertyId, boxes.assetId] }).onDelete("restrict"),
  ],
);

export const openEndpoints = sqliteTable(
  "open_endpoints",
  {
    electricalNodeId: text("electrical_node_id").primaryKey(),
    propertyId: text("property_id").notNull(),
    endpointKind: text("endpoint_kind", { enum: openEndpointKinds }).notNull().default("unknown"),
    description: text("description"),
  },
  (table) => [
    unique("open_endpoints_property_node_uq").on(table.propertyId, table.electricalNodeId),
    foreignKey({ name: "open_endpoints_property_node_fk", columns: [table.propertyId, table.electricalNodeId], foreignColumns: [electricalNodes.propertyId, electricalNodes.id] }).onDelete("restrict"),
    check("open_endpoints_kind_ck", enumCheck(table.endpointKind, openEndpointKinds)),
  ],
);

export const bondPoints = sqliteTable(
  "bond_points",
  {
    electricalNodeId: text("electrical_node_id").primaryKey(),
    propertyId: text("property_id").notNull(),
    boxAssetId: text("box_asset_id"),
    owningAssetId: text("owning_asset_id"),
    description: text("description"),
  },
  (table) => [
    unique("bond_points_property_node_uq").on(table.propertyId, table.electricalNodeId),
    foreignKey({ name: "bond_points_property_node_fk", columns: [table.propertyId, table.electricalNodeId], foreignColumns: [electricalNodes.propertyId, electricalNodes.id] }).onDelete("restrict"),
    foreignKey({ name: "bond_points_property_box_fk", columns: [table.propertyId, table.boxAssetId], foreignColumns: [boxes.propertyId, boxes.assetId] }).onDelete("restrict"),
    foreignKey({ name: "bond_points_property_asset_fk", columns: [table.propertyId, table.owningAssetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("bond_points_owner_ck", sql`${table.boxAssetId} is not null or ${table.owningAssetId} is not null`),
  ],
);

export const conductorEnds = sqliteTable(
  "conductor_ends",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    conductorId: text("conductor_id").notNull(),
    designation: text("designation", { enum: endDesignations }).notNull(),
    electricalNodeId: text("electrical_node_id").notNull(),
    terminationMethod: text("termination_method", { enum: terminationMethods }).notNull().default("unknown"),
    certainty: text("certainty", { enum: knowledgeStates }).notNull().default("unknown"),
    notes: text("notes"),
  },
  (table) => [
    unique("conductor_ends_property_id_id_uq").on(table.propertyId, table.id),
    unique("conductor_ends_conductor_designation_uq").on(table.propertyId, table.conductorId, table.designation),
    index("conductor_ends_node_idx").on(table.propertyId, table.electricalNodeId, table.conductorId),
    index("conductor_ends_conductor_idx").on(table.propertyId, table.conductorId),
    foreignKey({ name: "conductor_ends_property_conductor_fk", columns: [table.propertyId, table.conductorId], foreignColumns: [conductors.propertyId, conductors.id] }).onDelete("restrict"),
    foreignKey({ name: "conductor_ends_property_node_fk", columns: [table.propertyId, table.electricalNodeId], foreignColumns: [electricalNodes.propertyId, electricalNodes.id] }).onDelete("restrict"),
    check("conductor_ends_designation_ck", enumCheck(table.designation, endDesignations)),
    check("conductor_ends_termination_ck", enumCheck(table.terminationMethod, terminationMethods)),
    check("conductor_ends_certainty_ck", enumCheck(table.certainty, knowledgeStates)),
  ],
);

export const internalConnections = sqliteTable(
  "internal_connections",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    owningAssetId: text("owning_asset_id").notNull(),
    fromNodeId: text("from_node_id").notNull(),
    toNodeId: text("to_node_id").notNull(),
    connectionType: text("connection_type", { enum: internalConnectionKinds }).notNull(),
    contactStateGroup: text("contact_state_group"),
    contactState: text("contact_state"),
    directionality: text("directionality", { enum: connectionDirections }).notNull().default("bidirectional"),
    connectionState: text("connection_state", { enum: connectionStates }).notNull().default("connected"),
    certainty: text("certainty", { enum: knowledgeStates }).notNull().default("documentation_verified"),
    notes: text("notes"),
  },
  (table) => [
    unique("internal_connections_property_id_id_uq").on(table.propertyId, table.id),
    unique("internal_connections_edge_state_uq").on(table.propertyId, table.owningAssetId, table.fromNodeId, table.toNodeId, table.connectionType, table.contactStateGroup, table.contactState),
    index("internal_connections_from_idx").on(table.propertyId, table.fromNodeId),
    index("internal_connections_to_idx").on(table.propertyId, table.toNodeId),
    foreignKey({ name: "internal_connections_property_asset_fk", columns: [table.propertyId, table.owningAssetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    foreignKey({ name: "internal_connections_property_from_node_fk", columns: [table.propertyId, table.fromNodeId], foreignColumns: [electricalNodes.propertyId, electricalNodes.id] }).onDelete("restrict"),
    foreignKey({ name: "internal_connections_property_to_node_fk", columns: [table.propertyId, table.toNodeId], foreignColumns: [electricalNodes.propertyId, electricalNodes.id] }).onDelete("restrict"),
    check("internal_connections_distinct_nodes_ck", sql`${table.fromNodeId} <> ${table.toNodeId}`),
    check("internal_connections_type_ck", enumCheck(table.connectionType, internalConnectionKinds)),
    check("internal_connections_direction_ck", enumCheck(table.directionality, connectionDirections)),
    check("internal_connections_state_ck", enumCheck(table.connectionState, connectionStates)),
    check("internal_connections_certainty_ck", enumCheck(table.certainty, knowledgeStates)),
    check("internal_connections_contact_state_ck", sql`${table.connectionType} <> 'conditional_contact' or (${table.contactStateGroup} is not null and ${table.contactState} is not null)`),
  ],
);

export const circuitSources = sqliteTable(
  "circuit_sources",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    circuitId: text("circuit_id").notNull(),
    breakerPoleId: text("breaker_pole_id").notNull(),
    electricalNodeId: text("electrical_node_id"),
    legRole: text("leg_role", { enum: circuitSourceRoles }).notNull().default("line"),
    notes: text("notes"),
  },
  (table) => [
    unique("circuit_sources_property_id_id_uq").on(table.propertyId, table.id),
    unique("circuit_sources_circuit_pole_uq").on(table.propertyId, table.circuitId, table.breakerPoleId),
    index("circuit_sources_circuit_idx").on(table.propertyId, table.circuitId),
    index("circuit_sources_pole_idx").on(table.propertyId, table.breakerPoleId),
    index("circuit_sources_node_idx").on(table.propertyId, table.electricalNodeId),
    foreignKey({ name: "circuit_sources_property_circuit_fk", columns: [table.propertyId, table.circuitId], foreignColumns: [circuits.propertyId, circuits.id] }).onDelete("restrict"),
    foreignKey({ name: "circuit_sources_property_pole_fk", columns: [table.propertyId, table.breakerPoleId], foreignColumns: [breakerPoles.propertyId, breakerPoles.id] }).onDelete("restrict"),
    foreignKey({ name: "circuit_sources_property_node_fk", columns: [table.propertyId, table.electricalNodeId], foreignColumns: [electricalNodes.propertyId, electricalNodes.id] }).onDelete("restrict"),
    check("circuit_sources_role_ck", enumCheck(table.legRole, circuitSourceRoles)),
  ],
);

export const sharedNeutralGroups = sqliteTable(
  "shared_neutral_groups",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    notes: text("notes"),
    certainty: text("certainty", { enum: knowledgeStates }).notNull().default("unknown"),
  },
  (table) => [
    unique("shared_neutral_groups_property_id_id_uq").on(table.propertyId, table.id),
    check("shared_neutral_groups_certainty_ck", enumCheck(table.certainty, knowledgeStates)),
  ],
);

export const sharedNeutralMembers = sqliteTable(
  "shared_neutral_members",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    sharedNeutralGroupId: text("shared_neutral_group_id").notNull(),
    circuitId: text("circuit_id"),
    conductorId: text("conductor_id"),
    memberRole: text("member_role").notNull().default("member"),
  },
  (table) => [
    unique("shared_neutral_members_property_id_id_uq").on(table.propertyId, table.id),
    index("shared_neutral_members_group_idx").on(table.propertyId, table.sharedNeutralGroupId),
    index("shared_neutral_members_circuit_idx").on(table.propertyId, table.circuitId),
    index("shared_neutral_members_conductor_idx").on(table.propertyId, table.conductorId),
    foreignKey({ name: "shared_neutral_members_property_group_fk", columns: [table.propertyId, table.sharedNeutralGroupId], foreignColumns: [sharedNeutralGroups.propertyId, sharedNeutralGroups.id] }).onDelete("restrict"),
    foreignKey({ name: "shared_neutral_members_property_circuit_fk", columns: [table.propertyId, table.circuitId], foreignColumns: [circuits.propertyId, circuits.id] }).onDelete("restrict"),
    foreignKey({ name: "shared_neutral_members_property_conductor_fk", columns: [table.propertyId, table.conductorId], foreignColumns: [conductors.propertyId, conductors.id] }).onDelete("restrict"),
    check("shared_neutral_members_target_ck", sql`(${table.circuitId} is not null and ${table.conductorId} is null) or (${table.circuitId} is null and ${table.conductorId} is not null)`),
  ],
);

export const assetCircuitAssertions = sqliteTable(
  "asset_circuit_assertions",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    assetId: text("asset_id").notNull(),
    assetFunctionId: text("asset_function_id"),
    circuitId: text("circuit_id").notNull(),
    status: text("status", { enum: assertionStatuses }).notNull().default("active"),
    certainty: text("certainty", { enum: knowledgeStates }).notNull().default("unknown"),
    evidenceId: text("evidence_id"),
    notes: text("notes"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("asset_circuit_assertions_property_id_id_uq").on(table.propertyId, table.id),
    index("asset_circuit_assertions_asset_idx").on(table.propertyId, table.assetId, table.status),
    index("asset_circuit_assertions_circuit_idx").on(table.propertyId, table.circuitId, table.status),
    foreignKey({ name: "asset_circuit_assertions_property_asset_fk", columns: [table.propertyId, table.assetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    foreignKey({ name: "asset_circuit_assertions_property_function_fk", columns: [table.propertyId, table.assetId, table.assetFunctionId], foreignColumns: [assetFunctions.propertyId, assetFunctions.assetId, assetFunctions.id] }).onDelete("restrict"),
    foreignKey({ name: "asset_circuit_assertions_property_circuit_fk", columns: [table.propertyId, table.circuitId], foreignColumns: [circuits.propertyId, circuits.id] }).onDelete("restrict"),
    foreignKey({ name: "asset_circuit_assertions_property_evidence_fk", columns: [table.propertyId, table.evidenceId], foreignColumns: [evidence.propertyId, evidence.id] }).onDelete("restrict"),
    check("asset_circuit_assertions_status_ck", enumCheck(table.status, assertionStatuses)),
    check("asset_circuit_assertions_certainty_ck", enumCheck(table.certainty, knowledgeStates)),
    check("asset_circuit_assertions_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const traceGaps = sqliteTable(
  "trace_gaps",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    fromNodeId: text("from_node_id"),
    toNodeId: text("to_node_id"),
    fromAssetId: text("from_asset_id"),
    toAssetId: text("to_asset_id"),
    status: text("status", { enum: traceGapStatuses }).notNull().default("open"),
    certainty: text("certainty", { enum: knowledgeStates }).notNull().default("unknown"),
    description: text("description").notNull(),
    resolvedAt: text("resolved_at"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("trace_gaps_property_id_id_uq").on(table.propertyId, table.id),
    index("trace_gaps_status_idx").on(table.propertyId, table.status),
    index("trace_gaps_from_node_idx").on(table.propertyId, table.fromNodeId),
    index("trace_gaps_to_node_idx").on(table.propertyId, table.toNodeId),
    foreignKey({ name: "trace_gaps_property_from_node_fk", columns: [table.propertyId, table.fromNodeId], foreignColumns: [electricalNodes.propertyId, electricalNodes.id] }).onDelete("restrict"),
    foreignKey({ name: "trace_gaps_property_to_node_fk", columns: [table.propertyId, table.toNodeId], foreignColumns: [electricalNodes.propertyId, electricalNodes.id] }).onDelete("restrict"),
    foreignKey({ name: "trace_gaps_property_from_asset_fk", columns: [table.propertyId, table.fromAssetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    foreignKey({ name: "trace_gaps_property_to_asset_fk", columns: [table.propertyId, table.toAssetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    check("trace_gaps_status_ck", enumCheck(table.status, traceGapStatuses)),
    check("trace_gaps_certainty_ck", enumCheck(table.certainty, knowledgeStates)),
    check("trace_gaps_endpoints_ck", sql`${table.fromNodeId} is not null or ${table.toNodeId} is not null or ${table.fromAssetId} is not null or ${table.toAssetId} is not null`),
    check("trace_gaps_resolution_ck", sql`${table.status} = 'open' or ${table.resolvedAt} is not null`),
    check("trace_gaps_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const controlGroups = sqliteTable(
  "control_groups",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
    permanentCode: text("permanent_code").notNull(),
    name: text("name").notNull(),
    presentationLabel: text("presentation_label"),
    notes: text("notes"),
    lifecycleState: text("lifecycle_state", { enum: lifecycleStates }).notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("control_groups_property_id_id_uq").on(table.propertyId, table.id),
    unique("control_groups_property_code_uq").on(table.propertyId, table.permanentCode),
    check("control_groups_lifecycle_ck", enumCheck(table.lifecycleState, lifecycleStates)),
    check("control_groups_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const controlMembers = sqliteTable(
  "control_members",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    controlGroupId: text("control_group_id").notNull(),
    assetFunctionId: text("asset_function_id").notNull(),
    role: text("role", { enum: controlRoles }).notNull(),
    method: text("method", { enum: controlMethods }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
  },
  (table) => [
    unique("control_members_property_id_id_uq").on(table.propertyId, table.id),
    unique("control_members_group_function_role_uq").on(table.propertyId, table.controlGroupId, table.assetFunctionId, table.role),
    index("control_members_group_idx").on(table.propertyId, table.controlGroupId, table.role, table.sortOrder),
    index("control_members_function_idx").on(table.propertyId, table.assetFunctionId),
    foreignKey({ name: "control_members_property_group_fk", columns: [table.propertyId, table.controlGroupId], foreignColumns: [controlGroups.propertyId, controlGroups.id] }).onDelete("restrict"),
    foreignKey({ name: "control_members_property_function_fk", columns: [table.propertyId, table.assetFunctionId], foreignColumns: [assetFunctions.propertyId, assetFunctions.id] }).onDelete("restrict"),
    check("control_members_role_ck", enumCheck(table.role, controlRoles)),
    check("control_members_method_ck", enumCheck(table.method, controlMethods)),
  ],
);

export const controlLinks = sqliteTable(
  "control_links",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    controlGroupId: text("control_group_id").notNull(),
    fromFunctionId: text("from_function_id").notNull(),
    toFunctionId: text("to_function_id").notNull(),
    method: text("method", { enum: controlMethods }).notNull(),
    certainty: text("certainty", { enum: knowledgeStates }).notNull().default("unknown"),
    notes: text("notes"),
  },
  (table) => [
    unique("control_links_property_id_id_uq").on(table.propertyId, table.id),
    unique("control_links_edge_uq").on(table.propertyId, table.controlGroupId, table.fromFunctionId, table.toFunctionId, table.method),
    index("control_links_from_idx").on(table.propertyId, table.fromFunctionId),
    index("control_links_to_idx").on(table.propertyId, table.toFunctionId),
    foreignKey({ name: "control_links_property_group_fk", columns: [table.propertyId, table.controlGroupId], foreignColumns: [controlGroups.propertyId, controlGroups.id] }).onDelete("restrict"),
    foreignKey({ name: "control_links_property_from_function_fk", columns: [table.propertyId, table.fromFunctionId], foreignColumns: [assetFunctions.propertyId, assetFunctions.id] }).onDelete("restrict"),
    foreignKey({ name: "control_links_property_to_function_fk", columns: [table.propertyId, table.toFunctionId], foreignColumns: [assetFunctions.propertyId, assetFunctions.id] }).onDelete("restrict"),
    check("control_links_distinct_functions_ck", sql`${table.fromFunctionId} <> ${table.toFunctionId}`),
    check("control_links_method_ck", enumCheck(table.method, controlMethods)),
    check("control_links_certainty_ck", enumCheck(table.certainty, knowledgeStates)),
  ],
);

export const upgradeItems = sqliteTable(
  "upgrade_items",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    permanentCode: text("permanent_code").notNull(),
    targetAssetId: text("target_asset_id").notNull(),
    targetFunctionId: text("target_function_id"),
    targetBoxAssetId: text("target_box_asset_id"),
    status: text("status", { enum: upgradeStatuses }).notNull().default("investigate"),
    goal: text("goal").notNull(),
    priority: integer("priority").notNull().default(0),
    notes: text("notes"),
    completedInstalledProductId: text("completed_installed_product_id"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("upgrade_items_property_id_id_uq").on(table.propertyId, table.id),
    unique("upgrade_items_property_code_uq").on(table.propertyId, table.permanentCode),
    index("upgrade_items_status_idx").on(table.propertyId, table.status, table.priority),
    index("upgrade_items_asset_idx").on(table.propertyId, table.targetAssetId),
    foreignKey({ name: "upgrade_items_property_asset_fk", columns: [table.propertyId, table.targetAssetId], foreignColumns: [assets.propertyId, assets.id] }).onDelete("restrict"),
    foreignKey({ name: "upgrade_items_property_function_fk", columns: [table.propertyId, table.targetAssetId, table.targetFunctionId], foreignColumns: [assetFunctions.propertyId, assetFunctions.assetId, assetFunctions.id] }).onDelete("restrict"),
    foreignKey({ name: "upgrade_items_property_box_fk", columns: [table.propertyId, table.targetBoxAssetId], foreignColumns: [boxes.propertyId, boxes.assetId] }).onDelete("restrict"),
    foreignKey({ name: "upgrade_items_property_installed_product_fk", columns: [table.propertyId, table.completedInstalledProductId], foreignColumns: [installedProducts.propertyId, installedProducts.id] }).onDelete("restrict"),
    check("upgrade_items_status_ck", enumCheck(table.status, upgradeStatuses)),
    check("upgrade_items_priority_ck", sql`${table.priority} >= 0`),
    check("upgrade_items_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const upgradeRequirements = sqliteTable(
  "upgrade_requirements",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    upgradeItemId: text("upgrade_item_id").notNull(),
    requirementKind: text("requirement_kind", { enum: upgradeRequirementKinds }).notNull(),
    customRequirement: text("custom_requirement"),
    expectedValueJson: text("expected_value_json").notNull().default("null"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    unique("upgrade_requirements_property_id_id_uq").on(table.propertyId, table.id),
    index("upgrade_requirements_item_idx").on(table.propertyId, table.upgradeItemId, table.sortOrder),
    foreignKey({ name: "upgrade_requirements_property_item_fk", columns: [table.propertyId, table.upgradeItemId], foreignColumns: [upgradeItems.propertyId, upgradeItems.id] }).onDelete("restrict"),
    check("upgrade_requirements_kind_ck", enumCheck(table.requirementKind, upgradeRequirementKinds)),
    check("upgrade_requirements_custom_ck", sql`${table.requirementKind} <> 'custom' or length(trim(${table.customRequirement})) > 0`),
    check("upgrade_requirements_value_json_ck", sql`json_valid(${table.expectedValueJson})`),
  ],
);

export const upgradeObservations = sqliteTable(
  "upgrade_observations",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    upgradeRequirementId: text("upgrade_requirement_id").notNull(),
    readinessState: text("readiness_state", { enum: readinessStates }).notNull().default("unknown"),
    observedValueJson: text("observed_value_json").notNull().default("null"),
    certainty: text("certainty", { enum: knowledgeStates }).notNull().default("unknown"),
    evidenceId: text("evidence_id"),
    notes: text("notes"),
    observedAt: text("observed_at"),
  },
  (table) => [
    unique("upgrade_observations_property_id_id_uq").on(table.propertyId, table.id),
    index("upgrade_observations_requirement_idx").on(table.propertyId, table.upgradeRequirementId, table.observedAt),
    foreignKey({ name: "upgrade_observations_property_requirement_fk", columns: [table.propertyId, table.upgradeRequirementId], foreignColumns: [upgradeRequirements.propertyId, upgradeRequirements.id] }).onDelete("restrict"),
    foreignKey({ name: "upgrade_observations_property_evidence_fk", columns: [table.propertyId, table.evidenceId], foreignColumns: [evidence.propertyId, evidence.id] }).onDelete("restrict"),
    check("upgrade_observations_readiness_ck", enumCheck(table.readinessState, readinessStates)),
    check("upgrade_observations_value_json_ck", sql`json_valid(${table.observedValueJson})`),
    check("upgrade_observations_certainty_ck", enumCheck(table.certainty, knowledgeStates)),
  ],
);

export const proposedProducts = sqliteTable(
  "proposed_products",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    upgradeItemId: text("upgrade_item_id").notNull(),
    productModelId: text("product_model_id"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    productUrl: text("product_url"),
    estimatedCost: real("estimated_cost"),
    currency: text("currency"),
    rank: integer("rank").notNull().default(0),
    selected: integer("selected", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
  },
  (table) => [
    unique("proposed_products_property_id_id_uq").on(table.propertyId, table.id),
    index("proposed_products_item_idx").on(table.propertyId, table.upgradeItemId, table.rank),
    foreignKey({ name: "proposed_products_property_item_fk", columns: [table.propertyId, table.upgradeItemId], foreignColumns: [upgradeItems.propertyId, upgradeItems.id] }).onDelete("restrict"),
    foreignKey({ name: "proposed_products_property_model_fk", columns: [table.propertyId, table.productModelId], foreignColumns: [productModels.propertyId, productModels.id] }).onDelete("restrict"),
    check("proposed_products_cost_ck", sql`${table.estimatedCost} is null or ${table.estimatedCost} >= 0`),
    check("proposed_products_rank_ck", sql`${table.rank} >= 0`),
  ],
);

export const evidenceLinks = sqliteTable(
  "evidence_links",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull(),
    evidenceId: text("evidence_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    relationship: text("relationship").notNull().default("supports"),
    notes: text("notes"),
  },
  (table) => [
    unique("evidence_links_property_id_id_uq").on(table.propertyId, table.id),
    unique("evidence_links_target_uq").on(table.propertyId, table.evidenceId, table.targetType, table.targetId, table.relationship),
    index("evidence_links_evidence_idx").on(table.propertyId, table.evidenceId),
    index("evidence_links_target_idx").on(table.propertyId, table.targetType, table.targetId),
    foreignKey({ name: "evidence_links_property_evidence_fk", columns: [table.propertyId, table.evidenceId], foreignColumns: [evidence.propertyId, evidence.id] }).onDelete("restrict"),
  ],
);

export const captureDrafts = sqliteTable(
  "capture_drafts",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
    status: text("status", { enum: captureDraftStatuses }).notNull().default("in_progress"),
    currentStep: text("current_step"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    payloadJson: text("payload_json").notNull().default("{}"),
    lastRequestId: text("last_request_id"),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    unique("capture_drafts_property_id_id_uq").on(table.propertyId, table.id),
    index("capture_drafts_status_idx").on(table.propertyId, table.status, table.updatedAt),
    check("capture_drafts_status_ck", enumCheck(table.status, captureDraftStatuses)),
    check("capture_drafts_payload_json_ck", sql`json_valid(${table.payloadJson})`),
    check("capture_drafts_revision_ck", sql`${table.revision} >= 1`),
  ],
);

export const changeEvents = sqliteTable(
  "change_events",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
    actorSubject: text("actor_subject"),
    eventKind: text("event_kind", { enum: changeEventKinds }).notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    entityRevision: integer("entity_revision"),
    requestId: text("request_id"),
    summary: text("summary").notNull(),
    detailsJson: text("details_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    unique("change_events_property_id_id_uq").on(table.propertyId, table.id),
    index("change_events_history_idx").on(table.propertyId, table.createdAt, table.id),
    index("change_events_entity_idx").on(table.propertyId, table.entityType, table.entityId, table.createdAt),
    uniqueIndex("change_events_request_uq").on(table.propertyId, table.requestId),
    check("change_events_kind_ck", enumCheck(table.eventKind, changeEventKinds)),
    check("change_events_revision_ck", sql`${table.entityRevision} is null or ${table.entityRevision} >= 1`),
    check("change_events_details_json_ck", sql`json_valid(${table.detailsJson})`),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Circuit = typeof circuits.$inferSelect;
export type Conductor = typeof conductors.$inferSelect;
export type ConductorEnd = typeof conductorEnds.$inferSelect;
export type ElectricalNode = typeof electricalNodes.$inferSelect;
export type InternalConnection = typeof internalConnections.$inferSelect;
