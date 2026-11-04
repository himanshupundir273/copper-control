import fs from 'fs';
import path from 'path';
import { closeDatabase, runMigrations } from '../src/lib/db';
import { seedDatabase } from '../src/lib/seed-data';

async function main() {
  const dataDir = path.join(process.cwd(), '.data');
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    console.log('Cleared local .data directory.');
  }
  await runMigrations();
  await seedDatabase({ includeDemoTransactions: false });
  await closeDatabase();
  console.log('Database reset, master data seeded (Live Mode Only), and closed cleanly.');
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
