import { closeDatabase, runMigrations } from '../src/lib/db';
import { seedDatabase } from '../src/lib/seed-data';

async function main() {
  console.log('Ensuring migrations and seeding database...');
  await runMigrations();
  await seedDatabase({ includeDemoTransactions: true });
  await closeDatabase();
  console.log('Database seeded and closed cleanly.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
