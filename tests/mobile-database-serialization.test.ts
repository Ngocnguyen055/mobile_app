import { beforeEach, describe, expect, it, vi } from "vitest";

const sqliteState = vi.hoisted(() => ({
  active: 0,
  delayMs: 5,
  fatalFailures: 0,
  lockedFailures: 0,
  maxActive: 0,
  openCount: 0,
  statements: [] as string[],
}));

async function execute<T>(source: string, result: T): Promise<T> {
  sqliteState.statements.push(source);
  sqliteState.active += 1;
  sqliteState.maxActive = Math.max(sqliteState.maxActive, sqliteState.active);
  await new Promise((resolve) => setTimeout(resolve, sqliteState.delayMs));
  sqliteState.active -= 1;
  if (sqliteState.lockedFailures > 0) {
    sqliteState.lockedFailures -= 1;
    throw new Error("Caused by: Error code: database is locked");
  }
  if (sqliteState.fatalFailures > 0) {
    sqliteState.fatalFailures -= 1;
    throw new Error("synthetic initialization failure");
  }
  return result;
}

vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    sqliteState.openCount += 1;
    return {
      execAsync: (source: string) => execute(source, undefined),
      runAsync: (source: string) =>
        execute(source, { changes: 0, lastInsertRowId: 0 }),
      getFirstAsync: (source: string) => execute(source, null),
      getAllAsync: (source: string) => execute(source, []),
    };
  },
}));

const clearDatabaseRuntime = () => {
  delete (
    globalThis as typeof globalThis & {
      __studentPlannerSqliteRuntimeV1__?: unknown;
    }
  ).__studentPlannerSqliteRuntimeV1__;
};

describe("mobile SQLite access", () => {
  beforeEach(() => {
    vi.resetModules();
    clearDatabaseRuntime();
    sqliteState.active = 0;
    sqliteState.delayMs = 5;
    sqliteState.fatalFailures = 0;
    sqliteState.lockedFailures = 0;
    sqliteState.maxActive = 0;
    sqliteState.openCount = 0;
    sqliteState.statements = [];
  });

  it("serializes concurrent statements without changing journal mode", async () => {
    const { db } = await import("../src/mobile/services/storage/database.ts");
    const connection = await db();

    expect(sqliteState.statements).toContain("PRAGMA busy_timeout = 2000");
    expect(sqliteState.statements).not.toContain("PRAGMA journal_mode = WAL");

    sqliteState.active = 0;
    sqliteState.maxActive = 0;
    await Promise.all([
      connection.runAsync("INSERT INTO test VALUES(?)", "one"),
      connection.getAllAsync("SELECT * FROM test"),
      connection.getFirstAsync("SELECT 1 FROM test"),
    ]);

    expect(sqliteState.maxActive).toBe(1);
  });

  it("retries temporary database locks during initialization", async () => {
    sqliteState.lockedFailures = 2;
    const { db } = await import("../src/mobile/services/storage/database.ts");

    await expect(db()).resolves.toBeDefined();

    expect(
      sqliteState.statements.filter(
        (source) => source === "PRAGMA busy_timeout = 2000",
      ),
    ).toHaveLength(3);
  });

  it("does not cache a failed initialization forever", async () => {
    sqliteState.fatalFailures = 1;
    const { db } = await import("../src/mobile/services/storage/database.ts");

    await expect(db()).rejects.toThrow("synthetic initialization failure");
    await expect(db()).resolves.toBeDefined();
  });

  it("shares one queue and connection across Fast Refresh reloads", async () => {
    const firstModule = await import(
      "../src/mobile/services/storage/database.ts"
    );
    const firstConnection = await firstModule.db();
    sqliteState.active = 0;
    sqliteState.delayMs = 30;
    sqliteState.maxActive = 0;

    const firstOperation = firstConnection.runAsync("UPDATE first");
    await new Promise((resolve) => setTimeout(resolve, 1));
    vi.resetModules();
    const secondModule = await import(
      "../src/mobile/services/storage/database.ts"
    );
    const secondConnection = await secondModule.db();
    const secondOperation = secondConnection.runAsync("UPDATE second");

    await Promise.all([firstOperation, secondOperation]);
    expect(sqliteState.maxActive).toBe(1);
    expect(sqliteState.openCount).toBe(1);
  });
});
