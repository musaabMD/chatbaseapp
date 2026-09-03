import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

type BoundValue = string | number | null | ArrayBuffer | Uint8Array | boolean;

class LocalPreparedStatement {
  private values: BoundValue[] = [];

  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
  ) {}

  bind(...values: BoundValue[]) {
    this.values = values.map((v) => {
      if (typeof v === "boolean") return v ? 1 : 0;
      return v;
    });
    return this;
  }

  private stmt() {
    return this.db.prepare(this.sql);
  }

  async first<T = Record<string, unknown>>() {
    const row = this.stmt().get(...this.values) as T | undefined;
    return row ?? null;
  }

  async all<T = Record<string, unknown>>() {
    const results = this.stmt().all(...this.values) as T[];
    return { results, success: true, meta: {} };
  }

  async run() {
    const info = this.stmt().run(...this.values);
    return {
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
      },
    };
  }

  async raw<T = unknown[]>() {
    const rows = this.stmt().raw().all(...this.values) as T[];
    return rows;
  }
}

class LocalD1Database {
  constructor(private readonly db: Database.Database) {}

  prepare(sql: string) {
    return new LocalPreparedStatement(this.db, sql);
  }

  async exec(sql: string) {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }

  async batch<T = unknown>(statements: LocalPreparedStatement[]) {
    const results: T[] = [];
    for (const statement of statements) {
      results.push((await statement.all()) as T);
    }
    return results;
  }
}

let cached: LocalD1Database | null = null;

function applyMigrations(db: Database.Database) {
  const migrationsDir = path.join(process.cwd(), "migrations");
  if (!fs.existsSync(migrationsDir)) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS _local_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare(`SELECT id FROM _local_migrations`).all() as Array<{ id: string }>).map((r) => r.id),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    try {
      db.exec(sql);
    } catch (error) {
      // SQLite ALTER ADD COLUMN fails if column already exists — apply statement-by-statement
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("--"));
      for (const statement of statements) {
        try {
          db.exec(statement);
        } catch (stmtError) {
          const msg = stmtError instanceof Error ? stmtError.message : String(stmtError);
          if (!/duplicate column name/i.test(msg)) {
            throw stmtError;
          }
        }
      }
    }
    db.prepare(`INSERT INTO _local_migrations (id, applied_at) VALUES (?, ?)`).run(
      file,
      new Date().toISOString(),
    );
  }
}

export function getLocalDb(): D1Database {
  if (cached) return cached as unknown as D1Database;

  const dataDir = path.join(process.cwd(), ".data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "campusly.local.sqlite");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applyMigrations(sqlite);
  cached = new LocalD1Database(sqlite);
  return cached as unknown as D1Database;
}

export function isLocalMode() {
  return (
    process.env.CAMPUSLY_LOCAL === "1" ||
    process.env.CAMPUSLY_LOCAL === "true" ||
    !process.env.CLOUDFLARE_API_TOKEN
  );
}
