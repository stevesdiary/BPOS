/**
 * Driver-agnostic migration session.
 *
 * Mirrors the choice getDb() makes in client.ts: production is Neon over its
 * HTTP driver, while local dev and CI point DATABASE_URL at a standard
 * PostgreSQL server the HTTP driver cannot speak to. Migrations were
 * previously pinned to Neon, so a developer with a local Postgres could not
 * bring their database up at all.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { migrate as migrateNeon } from 'drizzle-orm/neon-http/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { isNeonUrl } from './client.js';

export interface MigrationSession {
  /** Run a raw statement before migrating — e.g. setting search_path. */
  execute(statement: string): Promise<void>;
  migrate(migrationsFolder: string): Promise<void>;
  /** Releases the connection. A postgres-js script hangs without it. */
  close(): Promise<void>;
}

export function createMigrationSession(): MigrationSession {
  if (isNeonUrl(env.DATABASE_URL)) {
    const db = drizzleNeon(neon(env.DATABASE_URL));
    return {
      execute: async (statement) => {
        await db.execute(sql.raw(statement));
      },
      migrate: (migrationsFolder) => migrateNeon(db, { migrationsFolder }),
      // HTTP transport — nothing to release.
      close: async () => undefined,
    };
  }

  // max: 1 is load-bearing, not tuning. postgres-js pools, and a SET
  // search_path on one pooled connection is invisible to the next — the tenant
  // migration would then run against public. One connection keeps the session
  // state the migration depends on.
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzlePostgres(client);

  return {
    execute: async (statement) => {
      await db.execute(sql.raw(statement));
    },
    migrate: (migrationsFolder) => migratePostgres(db, { migrationsFolder }),
    close: async () => {
      await client.end();
    },
  };
}
