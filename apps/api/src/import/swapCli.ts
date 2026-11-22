import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DB_PATH } from '../db';
import { swapCsvColumns, swapEnrollments } from './enrollmentFix';
import { withTarget } from './target';

const USAGE = `Usage: npm run fix:enrollments -w @tunion/api -- --users <users.csv> --email <a@x> [--email <b@x> ...] [options]

Exchanges Current and Previous courses for ONLY the listed students, after checking that their enrollments still match the CSV.
  (default)             Dry run: reports what would change; the database is not modified.
  --apply               Back up the database first, then apply in one transaction.
  --write-corrected-csv <path>   Also write a copy of the CSV with those rows corrected (the original is never edited),
                        so a later "import:csv" does not undo the fix.
  --db <path>           Database file (default: DATABASE_PATH or apps/api/data/tunion.db).
Undo: restore the printed backup, or edit the CSV back and re-import.`;

function main(): number {
  const argv = process.argv.slice(2);
  const emails: string[] = [];
  const opt: Record<string, string> = {};
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') apply = true;
    else if (a === '--help') return console.log(USAGE), 0;
    else if (a === '--email' || a === '--users' || a === '--db' || a === '--write-corrected-csv') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      if (a === '--email') emails.push(v); else opt[a] = v;
    } else throw new Error(`Unknown argument: ${a}`);
  }
  if (!opt['--users']) { console.error(`--users is required.\n\n${USAGE}`); return 2; }
  const base = process.env.INIT_CWD ?? process.cwd();
  const dbPath = opt['--db'] ? resolve(base, opt['--db']) : DB_PATH;
  const csv = readFileSync(resolve(base, opt['--users']), 'utf8');
  console.log(`Database: ${dbPath}\nMode: ${apply ? 'APPLY' : 'dry run'}\n`);

  const { value: report, backupPath } = withTarget(dbPath, apply, (db) => swapEnrollments(db, csv, emails, { apply }));
  if (report.errors.length) { console.error(`Nothing was changed:\n${report.errors.map((e) => `  - ${e}`).join('\n')}`); return 1; }
  for (const u of report.users) console.log(`  ${u.email}: ${u.outcome} -> now ${u.current} current / ${u.previous} previous${u.reason ? ` (${u.reason})` : ''}`);
  if (report.users.some((u) => u.outcome === 'refused')) { console.error('\nRefused: nothing was changed.'); return 1; }
  console.log(apply ? '\nApplied.' : '\nDRY RUN - nothing was written. Re-run with --apply.');
  if (backupPath) console.log(`Backup: ${backupPath}\nRollback: stop the app, copy that file over ${dbPath}, and delete ${dbPath}-wal / -shm if present.`);
  if (opt['--write-corrected-csv']) {
    const out = resolve(base, opt['--write-corrected-csv']);
    if (existsSync(out) || out === resolve(base, opt['--users'])) throw new Error(`Refusing to overwrite ${out}`);
    writeFileSync(out, swapCsvColumns(csv, emails));
    console.log(`Corrected CSV written to ${out}`);
  }
  return 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`Error: ${(err as Error).message}`);
  process.exitCode = 1;
}
