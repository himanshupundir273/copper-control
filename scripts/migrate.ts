import { closeDatabase, runMigrations } from '../src/lib/db';

async function main() {
  console.log('Running PostgreSQL migrations...');
  const applied = await runMigrations();
  if (applied.length === 0) {
    console.log('All migrations are already up to date.');
  } else {
    console.log('Applied migrations:', applied.join(', '));
  }
  await closeDatabase();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
