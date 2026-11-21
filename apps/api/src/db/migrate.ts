import { DB_PATH, getDb, closeDb } from './index';

getDb();
console.log(`Schema applied to ${DB_PATH}`);
closeDb();
