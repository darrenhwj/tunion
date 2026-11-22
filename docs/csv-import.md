# Importing real course and student data (CSV)

Private CSV files and SQLite databases are never committed (`*.db`, `data/` are gitignored; keep CSVs outside the repo).

## What it does
- `courses.csv` (`code,name,description`): matched on the normalized code (`cis1001` = `CIS 1001`). New courses are added; matched ones get the new title/description. Existing ids are kept.
- `users.csv` (`name,email,account_type,tutor_badge,current_courses,previous_courses`): matched on lower-cased email. Existing ids are kept.
  - Every non-admin becomes a **Student**. `tutor_badge = Yes` adds a row in `tutors` (the existing tutor capability) and lists their *previous* courses as courses they can tutor.
  - An existing admin keeps the admin role. The importer refuses to create a new admin.
  - Current/previous courses are stored in `enrollments.status` (`current` / `completed`). Enrollments are only added or re-labelled, never removed.
- Old demo users, courses, posts, resources and sessions are **never deleted or reassigned**. They are listed in the report; `--hide-legacy` hides them from the demo account selector and course directory (`is_hidden = 1`). Hidden records still resolve by id so old content keeps its author.
- All-or-nothing: any validation error (unknown course code, bad email, duplicate, malformed row) writes nothing. Writes happen in a single transaction. Repeat imports are idempotent.

## Commands (run from `~/Projects/tunion`, after merging)
```bash
git checkout main && git pull && npm install

# 1. Dry run: validates and previews. The database is not modified.
npm run import:csv -w @tunion/api -- \
  --courses ~/Documents/TUnion-import/tunion_courses.csv \
  --users ~/Documents/TUnion-import/tunion_users.csv

# 2. Apply: stop `npm run dev` first. A backup is written automatically before any change.
npm run import:csv -w @tunion/api -- \
  --courses ~/Documents/TUnion-import/tunion_courses.csv \
  --users ~/Documents/TUnion-import/tunion_users.csv --apply

# 3. Optional: hide the old demo users/courses (add --hide-legacy to a dry run first, then with --apply).
npm run import:csv -w @tunion/api -- \
  --courses ~/Documents/TUnion-import/tunion_courses.csv \
  --users ~/Documents/TUnion-import/tunion_users.csv --hide-legacy --apply

# Undo hiding
npm run import:csv -w @tunion/api -- --unhide-all --apply
```
Options: `--db <path>` (default `apps/api/data/tunion.db` or `DATABASE_PATH`), `--json`.

## Backup and rollback
`--apply` copies the database to `apps/api/data/backups/tunion-<timestamp>.db` first (the path is printed). To roll back:
```bash
# stop the app, then
cp apps/api/data/backups/tunion-<timestamp>.db apps/api/data/tunion.db
rm -f apps/api/data/tunion.db-wal apps/api/data/tunion.db-shm
```
For an extra manual copy before applying: `cp apps/api/data/tunion.db ~/Documents/tunion-before-import.db`.

## Data notes
- An unquoted description containing commas (last column) is re-joined and reported as a warning.
- Year/major are not in the CSV; new students get the defaults (year 1, Computer Science).
