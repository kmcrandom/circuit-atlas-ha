import Database, {
  type Database as BetterSqliteDatabase,
  type Statement as BetterSqliteStatement,
} from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

type SqliteValue = unknown;

export type SqliteRunResult = {
  success: true;
  changes: number;
  results?: Record<string, unknown>[];
};

export interface SqlitePreparedStatement {
  bind(...values: SqliteValue[]): SqlitePreparedStatement;
  run(): SqliteRunResult;
  all<T extends Record<string, unknown>>(): {
    success: true;
    results: T[];
  };
  first<T extends Record<string, unknown>>(): T | null;
}

export interface SqliteConnection {
  prepare(sql: string): SqlitePreparedStatement;
  batch(statements: readonly SqlitePreparedStatement[]): SqliteRunResult[];
}

type RuntimeDatabase = {
  client: BetterSqliteDatabase;
  db: CircuitAtlasDatabase;
  connection: SqliteConnection;
  path: string;
};

export type CircuitAtlasDatabase = BetterSQLite3Database<typeof schema> & {
  $client: BetterSqliteDatabase;
};

const globalDatabase = globalThis as typeof globalThis & {
  circuitAtlasDatabase?: RuntimeDatabase;
};

function configuredDatabasePath(): string {
  const explicit = process.env.CIRCUIT_ATLAS_DATABASE_PATH?.trim();
  if (explicit) return path.resolve(explicit);
  const dataDirectory = process.env.CIRCUIT_ATLAS_DATA_DIR?.trim();
  return path.resolve(dataDirectory || ".data", "circuit-atlas.sqlite");
}

class BoundStatement implements SqlitePreparedStatement {
  private values: SqliteValue[] = [];

  constructor(private readonly statement: BetterSqliteStatement) {}

  bind(...values: SqliteValue[]): SqlitePreparedStatement {
    const bound = new BoundStatement(this.statement);
    bound.values = values;
    return bound;
  }

  run(): SqliteRunResult {
    if (this.statement.reader) {
      return {
        success: true,
        changes: 0,
        results: this.statement.all(...this.values) as Record<string, unknown>[],
      };
    }
    const result = this.statement.run(...this.values);
    return { success: true, changes: result.changes };
  }

  all<T extends Record<string, unknown>>() {
    return {
      success: true as const,
      results: this.statement.all(...this.values) as T[],
    };
  }

  first<T extends Record<string, unknown>>(): T | null {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
}

function createConnection(client: BetterSqliteDatabase): SqliteConnection {
  return {
    prepare(sql) {
      return new BoundStatement(client.prepare(sql));
    },
    batch(statements) {
      return client.transaction(() => statements.map((statement) => statement.run()))();
    },
  };
}

function initializeDatabase(): RuntimeDatabase {
  const databasePath = configuredDatabasePath();
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const client = new Database(databasePath);
  try {
    client.pragma("foreign_keys = ON");
    client.pragma("busy_timeout = 5000");
    client.pragma("journal_mode = WAL");
    client.pragma("synchronous = NORMAL");
    const db = drizzle(client, { schema });
    migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    client.pragma("optimize");
    return { client, db, connection: createConnection(client), path: databasePath };
  } catch (error) {
    client.close();
    throw new Error("Circuit Atlas could not initialize its local database.", {
      cause: error,
    });
  }
}

function runtimeDatabase(): RuntimeDatabase {
  globalDatabase.circuitAtlasDatabase ??= initializeDatabase();
  return globalDatabase.circuitAtlasDatabase;
}

export function getDb(): CircuitAtlasDatabase {
  return runtimeDatabase().db;
}

export function getSqliteConnection(): SqliteConnection {
  return runtimeDatabase().connection;
}

export function getDatabasePath(): string {
  return runtimeDatabase().path;
}

export type AtomicStatement = { run(): unknown };

export function runStatementsAtomically(
  statements: readonly AtomicStatement[],
): unknown[] {
  const db = getDb();
  return db.transaction(() => statements.map((statement) => statement.run()));
}

export function databaseIsReady(): boolean {
  try {
    const result = runtimeDatabase().client.prepare("PRAGMA quick_check").get() as {
      quick_check?: string;
    };
    return result.quick_check === "ok";
  } catch {
    return false;
  }
}

export function closeDatabase(): void {
  const runtime = globalDatabase.circuitAtlasDatabase;
  if (!runtime) return;
  if (runtime.client.open) runtime.client.close();
  delete globalDatabase.circuitAtlasDatabase;
}
