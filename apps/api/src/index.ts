import { createApp } from './app';
import { getDb, DB_PATH } from './db';

const port = Number(process.env.PORT ?? 3001);
getDb();
createApp().listen(port, () => {
  console.log(`TUnion API listening on http://localhost:${port} (db: ${DB_PATH})`);
});
