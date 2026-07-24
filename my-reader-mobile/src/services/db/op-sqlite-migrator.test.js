/** @jest-environment node */

const { DatabaseSync } = require("node:sqlite")
const { drizzle } = require("drizzle-orm/op-sqlite")
const { migrate } = require("drizzle-orm/op-sqlite/migrator")
const { sql } = require("drizzle-orm")

function createClient() {
  const sqlite = new DatabaseSync(":memory:")

  function execute(query, params = []) {
    const statement = sqlite.prepare(query)
    const columns = statement.columns()

    if (columns.length > 0) {
      const rows = statement.all(...params)
      return {
        rowsAffected: 0,
        rows,
        rawRows: rows.map((row) => columns.map((column) => row[column.name])),
      }
    }

    const result = statement.run(...params)
    return {
      insertId: Number(result.lastInsertRowid),
      rowsAffected: result.changes,
      rows: [],
    }
  }

  return {
    close: () => sqlite.close(),
    executeAsync: async (query, params) => execute(query, params),
    executeRawAsync: async (query, params) =>
      execute(query, params).rawRows ?? [],
  }
}

const failingMigration = {
  journal: {
    entries: [
      {
        idx: 0,
        version: "6",
        when: 1,
        tag: "0000_failing_migration",
        breakpoints: true,
      },
    ],
  },
  migrations: {
    m0000: [
      "CREATE TABLE sync_cursors (id TEXT PRIMARY KEY);",
      "INVALID SQL;",
    ].join("--> statement-breakpoint"),
  },
}

describe("OP-SQLite migrations", () => {
  it("should roll back schema changes when a migration fails", async () => {
    const client = createClient()
    const db = drizzle(client)

    await expect(migrate(db, failingMigration)).rejects.toThrow()

    const tables = await client.executeRawAsync(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'sync_cursors'",
    )
    expect(tables).toEqual([])

    client.close()
  })

  it("should roll back nested changes when a nested transaction fails", async () => {
    const client = createClient()
    const db = drizzle(client)
    await client.executeAsync("CREATE TABLE events (name TEXT NOT NULL)")

    await db.transaction(async (tx) => {
      await tx.run(sql`INSERT INTO events (name) VALUES ('outer')`)

      await expect(
        tx.transaction(async (nestedTx) => {
          await nestedTx.run(sql`INSERT INTO events (name) VALUES ('nested')`)
          throw new Error("nested transaction failed")
        }),
      ).rejects.toThrow("nested transaction failed")
    })

    await expect(
      client.executeRawAsync("SELECT name FROM events ORDER BY name"),
    ).resolves.toEqual([["outer"]])

    client.close()
  })
})
