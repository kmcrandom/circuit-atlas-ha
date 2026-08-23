import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationPaths = readdirSync(new URL("../../drizzle/", import.meta.url))
  .filter((name) => name.endsWith(".sql"))
  .sort();

function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");

  for (const migrationPath of migrationPaths) {
    const migration = readFileSync(new URL(`../../drizzle/${migrationPath}`, import.meta.url), "utf8")
      .replaceAll("--> statement-breakpoint", "");
    database.exec(migration);
  }

  return database;
}

function createTwoProperties(database) {
  database.exec(`
    INSERT INTO workspaces (id, owner_subject) VALUES ('workspace-1', 'owner-1');
    INSERT INTO properties (id, workspace_id, permanent_code, name)
      VALUES ('property-1', 'workspace-1', 'PROP-001', 'Property One');
    INSERT INTO properties (id, workspace_id, permanent_code, name)
      VALUES ('property-2', 'workspace-1', 'PROP-002', 'Property Two');
  `);
}

test("initial migration applies cleanly and contains no house-specific seed data", () => {
  const database = migratedDatabase();
  const tables = database.prepare(`
    SELECT count(*) AS count
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).get();

  assert.equal(tables.count, 61);
  assert.equal(database.prepare("SELECT count(*) AS count FROM properties").get().count, 0);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  database.close();
});

test("composite foreign keys reject relationships across properties", () => {
  const database = migratedDatabase();
  createTwoProperties(database);
  database.exec(`
    INSERT INTO assets (id, property_id, permanent_code, kind, display_name)
      VALUES ('device-1', 'property-1', 'DEV-001', 'device', 'Switch');
  `);

  assert.throws(
    () => database.exec(`
      INSERT INTO devices (asset_id, property_id, device_kind)
        VALUES ('device-1', 'property-2', 'switch');
    `),
    /FOREIGN KEY constraint failed/,
  );
  database.close();
});

test("wire gauge remains optional for cables and individual conductors", () => {
  const database = migratedDatabase();
  createTwoProperties(database);
  database.exec(`
    INSERT INTO assets (id, property_id, permanent_code, kind, display_name)
      VALUES ('cable-1', 'property-1', 'CBL-001', 'cable', 'Cable');
    INSERT INTO cables (
      asset_id, property_id, wiring_method, insulated_conductor_count, equipment_ground_count
    ) VALUES ('cable-1', 'property-1', 'NM-B', 3, 1);
    INSERT INTO conductors (
      id, property_id, permanent_code, cable_asset_id, kind, core_index
    ) VALUES ('conductor-1', 'property-1', 'COND-001', 'cable-1', 'cable_core', 1);
  `);

  assert.equal(database.prepare("SELECT gauge FROM cables WHERE asset_id = 'cable-1'").get().gauge, null);
  assert.equal(database.prepare("SELECT gauge FROM conductors WHERE id = 'conductor-1'").get().gauge, null);
  database.close();
});

test("unknown cable conductor counts stay null instead of being coerced to zero", () => {
  const database = migratedDatabase();
  createTwoProperties(database);
  database.exec(`
    INSERT INTO assets (id, property_id, permanent_code, kind, display_name)
      VALUES ('cable-unknown', 'property-1', 'CBL-002', 'cable', 'Unidentified cable');
    INSERT INTO cables (asset_id, property_id, wiring_method)
      VALUES ('cable-unknown', 'property-1', 'unknown');
  `);

  const cable = database
    .prepare("SELECT insulated_conductor_count, equipment_ground_count FROM cables WHERE asset_id = 'cable-unknown'")
    .get();
  assert.equal(cable.insulated_conductor_count, null);
  assert.equal(cable.equipment_ground_count, null);
  assert.throws(
    () => database.exec("UPDATE cables SET insulated_conductor_count = -1 WHERE asset_id = 'cable-unknown'"),
    /CHECK constraint failed/,
  );
  database.close();
});

test("property codes and approved upgrade statuses are constrained", () => {
  const database = migratedDatabase();
  createTwoProperties(database);

  assert.throws(
    () => database.exec(`
      INSERT INTO properties (id, workspace_id, permanent_code, name)
        VALUES ('property-3', 'workspace-1', 'PROP-001', 'Duplicate code');
    `),
    /UNIQUE constraint failed/,
  );

  database.exec(`
    INSERT INTO assets (id, property_id, permanent_code, kind, display_name)
      VALUES ('device-1', 'property-1', 'DEV-001', 'device', 'Switch');
    INSERT INTO upgrade_items (
      id, property_id, permanent_code, target_asset_id, status, goal
    ) VALUES ('upgrade-1', 'property-1', 'UPG-001', 'device-1', 'purchased', 'Make smart');
  `);

  assert.throws(
    () => database.exec(`
      INSERT INTO upgrade_items (
        id, property_id, permanent_code, target_asset_id, status, goal
      ) VALUES ('upgrade-2', 'property-1', 'UPG-002', 'device-1', 'ready', 'Invalid state');
    `),
    /CHECK constraint failed/,
  );
  database.close();
});

test("device-internal connection state preserves open, unknown, and reverse relationships", () => {
  const database = migratedDatabase();
  createTwoProperties(database);
  database.exec(`
    INSERT INTO assets (id, property_id, permanent_code, kind, display_name)
      VALUES ('receptacle-1', 'property-1', 'DEV-001', 'device', 'Split receptacle');
    INSERT INTO electrical_nodes (id, property_id, kind, containing_asset_id)
      VALUES ('node-top', 'property-1', 'terminal', 'receptacle-1');
    INSERT INTO electrical_nodes (id, property_id, kind, containing_asset_id)
      VALUES ('node-bottom', 'property-1', 'terminal', 'receptacle-1');
    INSERT INTO internal_connections (
      id, property_id, owning_asset_id, from_node_id, to_node_id,
      connection_type, directionality, connection_state
    ) VALUES (
      'tab-1', 'property-1', 'receptacle-1', 'node-top', 'node-bottom',
      'breakable_tab', 'reverse', 'disconnected'
    );
  `);

  const persistedState = database
    .prepare("SELECT directionality, connection_state FROM internal_connections WHERE id = 'tab-1'")
    .get();
  assert.equal(persistedState.directionality, "reverse");
  assert.equal(persistedState.connection_state, "disconnected");
  assert.throws(
    () => database.exec("UPDATE internal_connections SET connection_state = 'energized' WHERE id = 'tab-1'"),
    /CHECK constraint failed/,
  );
  database.close();
});

test("smart-device details are property-scoped and secrets cannot be indexed", () => {
  const database = migratedDatabase();
  createTwoProperties(database);
  database.exec(`
    INSERT INTO assets (id, property_id, permanent_code, kind, display_name)
      VALUES ('smart-1', 'property-1', 'DEV-100', 'device', 'Smart switch');
    INSERT INTO installed_products (id, property_id, asset_id, manufacturer, model)
      VALUES ('product-1', 'property-1', 'smart-1', 'Example', 'Switch');
    INSERT INTO installed_device_details (
      id, property_id, installed_product_id, kind, label, value, normalized_value, sensitivity
    ) VALUES (
      'detail-1', 'property-1', 'product-1', 'zigbee_ieee', 'Zigbee IEEE',
      '00:12:4B:00:12:34:56:78', '00124B0012345678', 'identifier'
    );
  `);

  assert.throws(
    () => database.exec(`
      INSERT INTO installed_device_details (
        id, property_id, installed_product_id, kind, label, value, sensitivity
      ) VALUES ('detail-cross-property', 'property-2', 'product-1', 'custom', 'ID', 'value', 'identifier');
    `),
    /FOREIGN KEY constraint failed/,
  );
  assert.throws(
    () => database.exec(`
      INSERT INTO installed_device_details (
        id, property_id, installed_product_id, kind, label, value, normalized_value, sensitivity
      ) VALUES ('detail-secret', 'property-1', 'product-1', 'setup_code', 'Setup code', '12345678', '12345678', 'secret');
    `),
    /CHECK constraint failed/,
  );
  database.close();
});
