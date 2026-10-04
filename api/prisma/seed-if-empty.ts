/**
 * Boot-time bootstrap: seed the demo data only when the database is empty.
 *
 * The API container runs this on every start (see the CMD in api/Dockerfile),
 * so on a live database it must do nothing. Reseeding there would wipe every
 * conversation and reset the demo's daily budget count, which is derived from
 * stored messages.
 *
 * prisma/seed.ts stays what it was: an unconditional reset, for when a reset
 * is what you actually want.
 */
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let events: number;
  try {
    events = await prisma.event.count();
  } finally {
    await prisma.$disconnect();
  }

  if (events > 0) {
    console.log(
      `🌱 Database already has ${events} event(s); leaving it untouched.`,
    );
    return;
  }

  console.log('🌱 Empty database; seeding the demo data…');
  // seed.ts runs its own main() when loaded, and exits non-zero on failure,
  // which stops the container's boot chain before the API starts. `require`
  // rather than `import()`: under the project's module settings a dynamic
  // import would stay native and Node cannot load a .ts file natively.
  require('./seed');
}

main().catch((err: unknown) => {
  console.error('❌ Could not check whether the database needs seeding:', err);
  process.exit(1);
});
