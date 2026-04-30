/**
 * Jest setup file for e2e tests. Runs before every spec file.
 *
 * Loads root .env and overrides DATABASE_URL to point at `myconnect_test`.
 * Because @nestjs/config + dotenv default to `override: false`, env vars
 * already set on process.env take precedence over the .env file.
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error('DATABASE_URL not set; run `pnpm db:test:setup` first');
}

const url = new URL(baseUrl);
url.pathname = '/myconnect_test';
process.env.DATABASE_URL = url.toString();
