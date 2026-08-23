// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  getDb,
  getSqliteConnection,
} from "@/db";
import { ensureWorkspace } from "@/db/repositories/workspaces";
import {
  LocalPrivateFileStore,
  setPrivateFileStoreForTests,
} from "@/lib/files/local-store";
import type { RequestIdentity } from "@/lib/auth/identity";

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
