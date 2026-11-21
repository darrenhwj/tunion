import { getDb, closeDb } from './index';

// Seeds only when the database is empty, so `npm run dev` works on a fresh clone.
const { n } = getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
if (n === 0) {
  console.log('Database empty - seeding demo data...');
  await import('./seed');
} else {
  closeDb();
}
