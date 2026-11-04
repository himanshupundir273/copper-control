import { Pool, PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

// Ensure .env / .env.local are loaded when running standalone CLI scripts (db:migrate, db:seed)
function loadEnvFiles() {
  for (const fileName of ['.env.local', '.env']) {
    const envPath = path.join(process.cwd(), fileName);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnvFiles();

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
}

interface DbGlobalState {
  pgPool?: Pool;
  pglite?: PGlite;
  dbInitPromise?: Promise<void>;
  isInitializing?: boolean;
  txQueue?: Promise<any>;
}

// Use versioned singleton key so Next.js HMR cleanly discards any prior deadlocked state
const globalRoot = globalThis as unknown as {
  __copperControlTowerDbV3?: DbGlobalState;
};

if (!globalRoot.__copperControlTowerDbV3) {
  globalRoot.__copperControlTowerDbV3 = {};
}
const globalForDb = globalRoot.__copperControlTowerDbV3;

function isExternalPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '');
}

async function getPGliteInstance(): Promise<PGlite> {
  if (!globalForDb.pglite) {
    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    if (isTest || process.env.USE_MEMORY_PG === 'true') {
      const mem = new PGlite({ relaxedDurability: true });
      await mem.waitReady;
      globalForDb.pglite = mem;
    } else {
      const dataDir = process.env.PGLITE_DATA_DIR || path.join(process.cwd(), '.data', 'pgdata');
      fs.mkdirSync(path.dirname(dataDir), { recursive: true });

      // Remove stale postmaster.pid if left over from an ungraceful exit on Windows
      const pidFile = path.join(dataDir, 'postmaster.pid');
      if (fs.existsSync(pidFile)) {
        try {
          fs.unlinkSync(pidFile);
        } catch {
          // Ignore
        }
      }

      try {
        const instance = new PGlite(dataDir, { relaxedDurability: true });
        await Promise.race([
          instance.waitReady,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('PGlite disk directory lock timeout')), 4000)
          ),
        ]);
        globalForDb.pglite = instance;
      } catch (err) {
        console.warn(
          'PGlite disk directory busy/locked on Windows; switching to fast in-memory PostgreSQL 16 engine:',
          err
        );
        const memInstance = new PGlite({ relaxedDurability: true });
        await memInstance.waitReady;
        globalForDb.pglite = memInstance;
      }
    }
  }
  return globalForDb.pglite;
}

function getPgPool(): Pool {
  if (!globalForDb.pgPool) {
    globalForDb.pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalForDb.pgPool;
}

/**
 * Run all SQL files in db/migrations in lexicographical order
 */
export async function runMigrations(client?: DbClient): Promise<string[]> {
  const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const executor: DbClient = client || {
    query: rawQuery,
    exec: rawExec,
  };

  await executor.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedRes = await executor.query<{ version: string }>(
    'SELECT version FROM schema_migrations'
  );
  const appliedSet = new Set(appliedRes.rows.map((r) => r.version));
  const newlyApplied: string[] = [];

  for (const file of files) {
    if (!appliedSet.has(file)) {
      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await executor.exec(sqlContent);
      await executor.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
        [file]
      );
      newlyApplied.push(file);
    }
  }

  return newlyApplied;
}

async function rawQuery<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
  if (isExternalPostgres()) {
    const pool = getPgPool();
    const res = await pool.query(sql, params);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
  } else {
    const pglite = await getPGliteInstance();
    const res = await pglite.query<T>(sql, params);
    return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
  }
}

async function rawExec(sql: string): Promise<void> {
  if (isExternalPostgres()) {
    const pool = getPgPool();
    await pool.query(sql);
  } else {
    const pglite = await getPGliteInstance();
    await pglite.exec(sql);
  }
}

/**
 * Ensure migrations and initial master/demo seed have run once per lifecycle.
 * Guarded by globalForDb.isInitializing so recursive calls from seedDatabase -> withTransaction
 * never deadlock.
 */
export async function ensureDatabaseInitialized(): Promise<void> {
  if (globalForDb.isInitializing) {
    return;
  }
  if (!globalForDb.dbInitPromise) {
    globalForDb.isInitializing = true;
    globalForDb.dbInitPromise = (async () => {
      try {
        await runMigrations();
        if (process.env.SKIP_AUTO_SEED !== 'true') {
          const res = await rawQuery<{ count: string }>(
            'SELECT COUNT(*)::text as count FROM companies'
          );
          if (Number(res.rows[0]?.count ?? 0) === 0) {
            const { seedDatabase } = await import('./seed-data');
            await seedDatabase({ includeDemoTransactions: false });
          }
        }
      } catch (err) {
        globalForDb.dbInitPromise = undefined;
        throw err;
      } finally {
        globalForDb.isInitializing = false;
      }
    })();
  }
  await globalForDb.dbInitPromise;
}

/**
 * Execute a parameterized SQL query against PostgreSQL
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
  await ensureDatabaseInitialized();
  return rawQuery<T>(sql, params);
}

/**
 * Execute an atomic PostgreSQL transaction with automatic COMMIT / ROLLBACK
 */
export async function withTransaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
  await ensureDatabaseInitialized();

  if (isExternalPostgres()) {
    const pool = getPgPool();
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      const txClient: DbClient = {
        query: async <R = any>(sql: string, params: any[] = []) => {
          const res = await client.query(sql, params);
          return { rows: res.rows as R[], rowCount: res.rowCount ?? res.rows.length };
        },
        exec: async (sql: string) => {
          await client.query(sql);
        },
      };
      const result = await fn(txClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    const prev = globalForDb.txQueue ?? Promise.resolve();
    let releaseLock!: () => void;
    globalForDb.txQueue = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await prev;
    const pglite = await getPGliteInstance();
    try {
      await pglite.exec('BEGIN');
      const txClient: DbClient = {
        query: async <R = any>(sql: string, params: any[] = []) => {
          const res = await pglite.query<R>(sql, params);
          return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
        },
        exec: async (sql: string) => {
          await pglite.exec(sql);
        },
      };
      const result = await fn(txClient);
      await pglite.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        await pglite.exec('ROLLBACK');
      } catch {
        // Ignore rollback error if transaction already aborted
      }
      throw err;
    } finally {
      releaseLock();
    }
  }
}

export async function closeDatabase(): Promise<void> {
  if (globalForDb.pglite) {
    try {
      await globalForDb.pglite.close();
    } catch {
      // Ignore
    }
    globalForDb.pglite = undefined;
  }
  if (globalForDb.pgPool) {
    await globalForDb.pgPool.end();
    globalForDb.pgPool = undefined;
  }
}

export async function resetDatabaseForTests(): Promise<void> {
  if (globalForDb.pglite) {
    try {
      await globalForDb.pglite.close();
    } catch {
      // Ignore
    }
  }
  globalForDb.pglite = new PGlite({ relaxedDurability: true });
  await globalForDb.pglite.waitReady;
  globalForDb.dbInitPromise = undefined;
  globalForDb.isInitializing = false;
  globalForDb.txQueue = Promise.resolve();
  await runMigrations();
}
