// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  closeDatabase,
  getDb,
  getSqliteConnection,
} from "@/db";
import { ensureWorkspace } from "@/db/repositories/workspaces";
import {
  createProperty,
  createResource,
  createAssetAggregate,
  buildPropertyExport,
  applyOwnedPropertyImport,
  inventoryViewModels,
  nextLocationCode,
  searchProperty,
  previewOwnedPropertyImport,
  updateResource,
  activateWiringConfiguration,
  cloneWiringConfiguration,
  compareWiringConfigurations,
  listWiringConfigurations,
  updateWiringConfiguration,
} from "@/db/repositories";
import * as schema from "@/db/schema";
import {
  LocalPrivateFileStore,
  setPrivateFileStoreForTests,
} from "@/lib/files/local-store";
import type { RequestIdentity } from "@/lib/auth/identity";
import { sealPropertyManifest, type UnsealedPropertyManifestV1 } from "@/lib/import-export";

let directory = "";

beforeEach(async () => {
  closeDatabase();
  setPrivateFileStoreForTests(null);
  directory = await mkdtemp(path.join(tmpdir(), "circuit-atlas-test-"));
  process.env.CIRCUIT_ATLAS_DATA_DIR = directory;
});

afterEach(async () => {
  closeDatabase();
  setPrivateFileStoreForTests(null);
  delete process.env.CIRCUIT_ATLAS_DATA_DIR;
  await rm(directory, { recursive: true, force: true });
});

describe("local persistence", () => {
  it("clones, compares, and activates a wiring plan without changing its history", async () => {
    const identity: RequestIdentity = { provider: "home-assistant", subject: "wiring-owner", externalUserId: "home-assistant:wiring-owner", email: null, displayName: "Wiring Owner", isLocalDevelopment: false };
    const property = await createProperty(identity, { name: "Fictional wiring property" });
    const [current] = await listWiringConfigurations(identity, property.id);
    const db = getDb();
    await db.insert(schema.electricalNodes).values({ id: "fictional-node", propertyId: property.id, kind: "terminal", label: "Fictional terminal" });
    await db.insert(schema.conductors).values({ id: "fictional-conductor", propertyId: property.id, permanentCode: "COND-001", kind: "pigtail" });
    await db.insert(schema.conductorEnds).values({ id: "fictional-end", propertyId: property.id, conductorId: "fictional-conductor", designation: "A", electricalNodeId: "fictional-node" });
    await db.insert(schema.wiringConfigurationNodes).values({ propertyId: property.id, wiringConfigurationId: current.id, electricalNodeId: "fictional-node" });
    await db.insert(schema.conductorEndConnections).values({ id: "fictional-connection", propertyId: property.id, wiringConfigurationId: current.id, conductorEndId: "fictional-end", electricalNodeId: "fictional-node", conductorRole: "traveler_1", connectionState: "connected" });

    const plan = await cloneWiringConfiguration(identity, property.id, current.id, { name: "Smart-switch plan", status: "planned" });
    await db.update(schema.conductorEndConnections).set({ connectionState: "spare", electricalNodeId: null }).where(and(eq(schema.conductorEndConnections.propertyId, property.id), eq(schema.conductorEndConnections.wiringConfigurationId, plan.id)));
    const comparison = await compareWiringConfigurations(identity, property.id, current.id, plan.id);
    expect(comparison.conductorEnds).toHaveLength(1);
    expect(comparison.conductorEnds[0].after?.connectionState).toBe("spare");
    expect(comparison.totalChanges).toBe(1);

    await activateWiringConfiguration(identity, property.id, plan.id, { revision: plan.revision, expectedCurrentConfigurationId: current.id });
    const configurations = await listWiringConfigurations(identity, property.id);
    expect(configurations.find((item) => item.id === plan.id)?.status).toBe("current");
    expect(configurations.find((item) => item.id === current.id)?.status).toBe("historical");
    await expect(updateWiringConfiguration(identity, property.id, current.id, { revision: current.revision + 1, name: "Mutated history" })).rejects.toThrow(/read-only/i);
  });
  it("creates the complete schema and preserves rows across a restart", () => {
    const first = getDb().$client;
    const count = first
      .prepare(
        "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .get() as { count: number };
    expect(count.count).toBeGreaterThanOrEqual(61);
    first
      .prepare("INSERT INTO workspaces (id, owner_subject) VALUES (?, ?)")
      .run("restart-workspace", "restart-owner");
    closeDatabase();

    const row = getDb().$client
      .prepare("SELECT owner_subject FROM workspaces WHERE id = ?")
      .get("restart-workspace") as { owner_subject: string };
    expect(row.owner_subject).toBe("restart-owner");
    expect(getDb().$client.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("rolls back every statement when an atomic mutation fails", () => {
    const connection = getSqliteConnection();
    expect(() =>
      connection.batch([
        connection
          .prepare("INSERT INTO workspaces (id, owner_subject) VALUES (?, ?)")
          .bind("rolled-back", "owner-one"),
        connection
          .prepare("INSERT INTO workspaces (id, owner_subject) VALUES (?, ?)")
          .bind("rolled-back", "owner-two"),
      ]),
    ).toThrow();
    const row = getDb().$client
      .prepare("SELECT id FROM workspaces WHERE id = ?")
      .get("rolled-back");
    expect(row).toBeUndefined();
  });

  it("maps both authenticated providers to one installation workspace", async () => {
    const homeAssistant: RequestIdentity = {
      provider: "home-assistant",
      subject: "ha-user",
      externalUserId: "home-assistant:ha-user",
      email: null,
      displayName: "HA Owner",
      isLocalDevelopment: false,
    };
    const cloudflare: RequestIdentity = {
      provider: "cloudflare-access",
      subject: "cf-user",
      externalUserId: "cloudflare-access:cf-user",
      email: "owner@example.test",
      displayName: "owner@example.test",
      isLocalDevelopment: false,
    };
    const first = await ensureWorkspace(homeAssistant);
    const second = await ensureWorkspace(cloudflare);
    expect(second.id).toBe(first.id);
    expect(second.ownerSubject).toBe("circuit-atlas-installation");
  });

  it("allocates immutable location codes while skipping imported or legacy values", async () => {
    const identity: RequestIdentity = {
      provider: "home-assistant",
      subject: "location-owner",
      externalUserId: "home-assistant:location-owner",
      email: null,
      displayName: "Location Owner",
      isLocalDevelopment: false,
    };
    const property = await createProperty(identity, { name: "Fictional property" });
    const firstCode = await nextLocationCode(identity, property.id, "structures");
    const first = await createResource(
      { identity, propertyId: property.id },
      "structures",
      { code: firstCode, name: "First fictional structure", kind: "building" },
    );
    await createResource(
      { identity, propertyId: property.id },
      "structures",
      { code: "STR-0002", name: "Imported fictional structure", kind: "building" },
    );

    expect(firstCode).toBe("STR-0001");
    expect(await nextLocationCode(identity, property.id, "structures")).toBe("STR-0003");
    const concurrent = await Promise.all(
      Array.from({ length: 6 }, () => nextLocationCode(identity, property.id, "spaces")),
    );
    expect(new Set(concurrent).size).toBe(6);
    const level = await createResource(
      { identity, propertyId: property.id },
      "levels",
      { structureId: String(first.id), code: "HIDDEN-LEVEL", name: "Example level", elevationOrder: 1 },
    );
    await createResource(
      { identity, propertyId: property.id },
      "spaces",
      { levelId: String(level.id), code: "HIDDEN-ROOM-CODE", name: "Example room", kind: "room" },
    );
    expect(await searchProperty(identity, property.id, "HIDDEN-ROOM-CODE")).toEqual([]);
    expect(await searchProperty(identity, property.id, "Example room")).toEqual([
      expect.objectContaining({ label: "Example room" }),
    ]);
    expect((await searchProperty(identity, property.id, "Example room"))[0]).not.toHaveProperty("permanentCode");
    await expect(updateResource(
      { identity, propertyId: property.id },
      "structures",
      String(first.id),
      1,
      { code: "CHANGED" },
    )).rejects.toThrow(/immutable/i);
  });

  it("round-trips structured specifications for each installed bulb", async () => {
    const identity: RequestIdentity = {
      provider: "home-assistant",
      subject: "bulb-owner",
      externalUserId: "home-assistant:bulb-owner",
      email: null,
      displayName: "Bulb Owner",
      isLocalDevelopment: false,
    };
    const property = await createProperty(identity, { name: "Fictional bulb property" });
    const fixture = await createAssetAggregate(identity, property.id, {
      displayName: "Fictional two-lamp fixture",
      kind: "fixture",
      lightSources: [{
        holderLabel: "Lamp 1",
        sourceType: "replaceable",
        smartState: "smart",
        wattage: 8.5,
        equivalentWattage: 60,
        lumens: 800,
        colorTemperatureKelvin: 2700,
        colorTemperatureMinKelvin: 2200,
        colorTemperatureMaxKelvin: 6500,
        colorCapability: "tunable-white",
        dimmable: true,
      }],
    });

    const inventory = await inventoryViewModels(identity, property.id);
    const saved = inventory.items.find((item) => item.id === fixture.assetId)?.lightSources?.[0];
    expect(saved).toEqual(expect.objectContaining({
      wattage: 8.5,
      equivalentWattage: 60,
      lumens: 800,
      colorTemperatureKelvin: 2700,
      colorTemperatureMinKelvin: 2200,
      colorTemperatureMaxKelvin: 6500,
      colorCapability: "tunable-white",
      dimmable: true,
    }));

    const exported = await buildPropertyExport(identity, property.id, { includeFiles: false });
    const lightSource = exported.records.find((record) => record.kind === "light_sources");
    expect(lightSource?.data).toEqual(expect.objectContaining({
      watts: 8.5,
      equivalent_watts: 60,
      lumens: 800,
      color_temperature_min_kelvin: 2200,
      color_temperature_max_kelvin: 6500,
      color_capability: "tunable_white",
      dimmable: 1,
    }));
  });

  it("remaps a colliding imported spatial code without changing UUID relationships", async () => {
    const identity: RequestIdentity = {
      provider: "home-assistant",
      subject: "import-owner",
      externalUserId: "home-assistant:import-owner",
      email: null,
      displayName: "Import Owner",
      isLocalDevelopment: false,
    };
    const property = await createProperty(identity, { name: "Fictional import property" });
    await createResource(
      { identity, propertyId: property.id },
      "structures",
      { code: "DUPLICATE", name: "Existing structure", kind: "building" },
    );
    const exported = await buildPropertyExport(identity, property.id, { includeFiles: false });
    const unsealedChecksums = {
      algorithm: exported.checksums.algorithm,
      attachments: exported.checksums.attachments,
    };
    const structureId = crypto.randomUUID();
    const levelId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const draft: UnsealedPropertyManifestV1 = {
      ...exported,
      exportId: crypto.randomUUID(),
      exportedAt: timestamp,
      records: [
        ...exported.records,
        {
          id: `structures:${structureId}`,
          propertyId: property.id,
          kind: "structures",
          revision: 1,
          data: {
            id: structureId,
            code: "DUPLICATE",
            name: "Incoming structure",
            kind: "building",
            notes: null,
            sort_order: 0,
            lifecycle_state: "active",
            revision: 1,
            created_at: timestamp,
            updated_at: timestamp,
          },
        },
        {
          id: `levels:${levelId}`,
          propertyId: property.id,
          kind: "levels",
          revision: 1,
          data: {
            id: levelId,
            structure_id: structureId,
            code: "IMPORTED-LEVEL",
            name: "Incoming level",
            elevation_order: 1,
            notes: null,
            lifecycle_state: "active",
            revision: 1,
            created_at: timestamp,
            updated_at: timestamp,
          },
        },
      ],
      checksums: unsealedChecksums,
    };
    const incoming = await sealPropertyManifest(draft);
    const preview = await previewOwnedPropertyImport(identity, property.id, incoming, "merge");
    expect(preview.canApply).toBe(true);
    await applyOwnedPropertyImport(identity, property.id, incoming, "merge", preview.confirmationToken!);

    const importedStructure = getDb().$client
      .prepare("SELECT code FROM structures WHERE id = ?")
      .get(structureId) as { code: string };
    expect(importedStructure.code).not.toBe("DUPLICATE");
    expect(importedStructure.code).toMatch(/^STR-/);
    const importedLevel = getDb().$client
      .prepare("SELECT structure_id, code FROM levels WHERE id = ?")
      .get(levelId) as { structure_id: string; code: string };
    expect(importedLevel).toEqual({ structure_id: structureId, code: "IMPORTED-LEVEL" });
  });

  it("writes private files atomically and rejects traversal", async () => {
    const store = new LocalPrivateFileStore(path.join(directory, "files"));
    const key = "properties/property-test/attachments/file-test.bin";
    await store.put(key, new TextEncoder().encode("private bytes"));
    const stored = await store.get(key);
    expect(stored?.size).toBe(13);
    expect(new TextDecoder().decode(await stored?.bytes())).toBe("private bytes");
    expect(
      await readFile(path.join(directory, "files", key), "utf8"),
    ).toBe("private bytes");
    await expect(store.put("../outside", new Uint8Array())).rejects.toThrow();
    await expect(store.get("/absolute/path")).rejects.toThrow();
    await store.delete(key);
    expect(await store.get(key)).toBeNull();
  });
});
