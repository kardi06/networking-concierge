/**
 * One-time setup script for the e2e test database.
 *
 * Run via: `pnpm db:test:setup`
 *
 * - Creates `myconnect_test` if it doesn't exist (uses the maintenance DB).
 * - Drops `public` schema and re-applies all SQL migrations from prisma/migrations.
 * - Idempotent: safe to re-run after schema changes.
 */

import { Client } from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';

const TEST_DB_NAME = 'myconnect_test';

async function main() {
  // Load env from repo root.
  dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL not set in .env');
  }

  // Connect to the maintenance `postgres` database to issue CREATE DATABASE.
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = '/postgres';

  const adminClient = new Client({ connectionString: adminUrl.toString() });
  await adminClient.connect();

  const exists = await adminClient.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [TEST_DB_NAME],
  );
  if (exists.rowCount === 0) {
    await adminClient.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    console.log(`✓ Created database: ${TEST_DB_NAME}`);
  } else {
    console.log(`• Database already exists: ${TEST_DB_NAME}`);
  }
  await adminClient.end();

  // Now connect to the test DB and (re)apply migrations.
  const testUrl = new URL(baseUrl);
  testUrl.pathname = `/${TEST_DB_NAME}`;

  const testClient = new Client({ connectionString: testUrl.toString() });
  await testClient.connect();

  // Wipe and recreate schema for a clean state.
  await testClient.query(
    'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
  );
  console.log('✓ Reset public schema');

  // Apply migrations in lexicographic order.
  const migrationsDir = resolve(__dirname, '..', 'prisma', 'migrations');
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+_/.test(d.name))
    .map((d) => d.name)
    .sort();

  for (const dir of dirs) {
    const sqlPath = resolve(migrationsDir, dir, 'migration.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    await testClient.query(sql);
    console.log(`✓ Applied migration: ${dir}`);
  }

  await testClient.end();
  console.log(`\n✓ Test database ready at ${testUrl.toString()}`);
}

main().catch((err) => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});
