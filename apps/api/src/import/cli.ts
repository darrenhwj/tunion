import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DB_PATH } from '../db';
import { runImport, unhideAll, type ImportReport, type LegacyRecord } from './importer';
import { withTarget } from './target';

const USAGE = `Usage: npm run import:csv -w @tunion/api -- --courses <courses.csv> --users <users.csv> [options]

  (default)        Dry run: validate and preview. The database is NOT modified.
  --apply          Back up the database, then import in one transaction.
  --hide-legacy    Also hide demo users/courses that are not in the CSVs (reversible; nothing is deleted).
  --unhide-all     Instead of importing, un-hide every hidden user and course (use with --apply to write).
  --db <path>      Database file (default: DATABASE_PATH or apps/api/data/tunion.db).
  --json           Print the report as JSON.`;

function parseArgs(argv: string[]) {
  const flags = new Set(['--apply', '--hide-legacy', '--unhide-all', '--json', '--help']);
  const values = new Set(['--courses', '--users', '--db']);
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (flags.has(a)) out[a] = true;
    else if (values.has(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      out[a] = v;
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

const list = (title: string, items: string[]) => (items.length ? `  ${title} (${items.length}): ${items.join(', ')}` : `  ${title}: 0`);
const legacy = (title: string, items: LegacyRecord[]) =>
  [`  ${title} (${items.length})`, ...items.map((r) => `    - #${r.id} ${r.label} - ${r.activity}`)].join('\n');

function print(r: ImportReport, apply: boolean, hideLegacy: boolean): void {
  const out: string[] = [];
  out.push('Courses', list('added', r.courses.added), list('updated', r.courses.updated), `  unchanged: ${r.courses.unchanged.length}`);
  out.push('Users (all imported as Student)', list('added', r.users.added), list('updated', r.users.updated), `  unchanged: ${r.users.unchanged.length}`);
  out.push('Tutor badges', list('newly granted', r.tutorBadges.added));
  if (r.tutorBadges.existingNotRemoved.length) out.push(list('badge=No but already a tutor (left as is)', r.tutorBadges.existingNotRemoved));
  const e = r.enrollments;
  out.push('Enrollments', `  added: ${e.added}, status changed: ${e.changed}, unchanged: ${e.unchanged}, existing but not in CSV (kept): ${e.keptNotInCsv}`);
  out.push('Legacy records not in the CSVs (never deleted)', legacy('users', r.legacyUsers), legacy('courses', r.legacyCourses));
  if (!hideLegacy && (r.legacyUsers.length || r.legacyCourses.length)) {
    out.push('  To hide them from the account selector and course directory, re-run with --hide-legacy (undo: --unhide-all).');
  }
  if (r.warnings.length) out.push('Warnings', ...r.warnings.map((w) => `  - ${w}`));
  out.push(apply ? '\nApplied.' : '\nDRY RUN - nothing was written. Re-run with --apply to import.');
  console.log(out.join('\n'));
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args['--help']) return console.log(USAGE), 0;
  const base = process.env.INIT_CWD ?? process.cwd(); // npm runs scripts from apps/api; resolve user paths from where they typed them
  const dbPath = args['--db'] ? resolve(base, args['--db'] as string) : DB_PATH;
  const apply = args['--apply'] === true;
  const json = args['--json'] === true;
  console.log(`Database: ${dbPath}\nMode: ${apply ? 'APPLY' : 'dry run'}\n`);

  if (args['--unhide-all']) {
    const { value, backupPath } = withTarget(dbPath, apply, (db) => unhideAll(db));
    console.log(`${apply ? 'Un-hid' : 'Would un-hide'} ${value.users} user(s) and ${value.courses} course(s).`);
    if (backupPath) console.log(`Backup: ${backupPath}`);
    return 0;
  }
  if (typeof args['--courses'] !== 'string' || typeof args['--users'] !== 'string') {
    console.error(`--courses and --users are required.\n\n${USAGE}`);
    return 2;
  }
  const input = {
    coursesCsv: readFileSync(resolve(base, args['--courses']), 'utf8'),
    usersCsv: readFileSync(resolve(base, args['--users']), 'utf8'),
  };
  const hideLegacy = args['--hide-legacy'] === true;
  const { value: report, backupPath } = withTarget(dbPath, apply, (db) => runImport(db, input, { apply, hideLegacy }));
  if (json) console.log(JSON.stringify(report, null, 2));
  else if (report.errors.length) console.error(`Validation failed - nothing was written:\n${report.errors.map((x) => `  - ${x}`).join('\n')}`);
  else print(report, apply, hideLegacy);
  if (report.errors.length) return 1;
  if (backupPath) console.log(`Backup: ${backupPath}\nRollback: stop the app, then copy that file over ${dbPath} and delete ${dbPath}-wal / ${dbPath}-shm if present.`);
  return 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`Error: ${(err as Error).message}`);
  process.exitCode = 1;
}
