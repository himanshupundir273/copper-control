import { closeDatabase, runMigrations } from '../src/lib/db';
import { seedDatabase } from '../src/lib/seed-data';

async function main() {
  console.log('Ensuring migrations and seeding master data (Live Mode Only)...');
  await runMigrations();
  await seedDatabase({ includeDemoTransactions: false });
  await closeDatabase();
  console.log('Master data seeded and database closed cleanly.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
