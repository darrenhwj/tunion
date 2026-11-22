# Importing real course and student data (CSV)

Private CSV files and SQLite databases are never committed (`*.db`, `data/` are gitignored; keep CSVs outside the repo).

## What it does
- `courses.csv` (`code,name,description`): matched on the normalized code (`cis1001` = `CIS 1001`). New courses are added; matched ones get the new title/description. Existing ids are kept.
- `users.csv` (`name,email,account_type,tutor_badge,current_courses,previous_courses`, plus optional `tutoring_subjects,year,major`): matched on lower-cased email. Existing ids are kept. Every non-admin becomes a **Student**; an existing admin keeps the admin role and the importer refuses to create a new admin.
- **Strict parsing.** A record whose column count differs from the header (typically an unquoted comma in a description) is **rejected with its row number**, never re-assembled. Quote any field that contains commas: `"Processes, threads, and memory"`. A stray quote or text after a closing quote is also an error. **CIS 3207's description is always listed under "NEEDS VERIFICATION"** (even when it parses) until you have checked it against the source.
- **Tutor badge (`tutor_badge`).** `Yes` grants the badge (or re-activates a revoked one); `No` **revokes** it; blank leaves the current status unchanged; anything else is an error. Revoking sets `tutors.is_active = 0`: the tutor disappears from the directory and cannot be requested or edit availability, but the tutor row, subjects, requests and sessions are all kept. The report lists open requests/scheduled sessions of revoked tutors so you can handle them. A later `Yes` restores the same tutor row.
- **Tutoring subjects (`tutoring_subjects`).** Comma-separated course codes the tutor explicitly offers. They are **never derived from previous courses**. Blank/absent = unspecified: a new tutor has none (reported as a warning, since they cannot be requested for any course) and an existing tutor keeps theirs. A non-blank list replaces the tutor's subjects exactly; additions and removals are reported.
- **Year / major.** Never invented. Blank/absent = not specified: stored as `0` / `''` and returned by the API as `null` (the UI shows "Major and year not specified"). An existing student's known values are not overwritten by blanks. `year` must be a whole number 1-8.
- **Enrollments.** For each user in the CSV, `current_courses` / `previous_courses` become their `current` / `completed` enrollments (added, re-labelled, or **removed if no longer listed**). Removals are listed in the report, including in a dry run. Only the enrollment link is removed; discussions, replies, resources, study groups and tutoring history are never touched. A user with both course cells blank is treated as "no course data" and keeps what they have. Users not in the CSV are untouched.
- Old demo users, courses, posts, resources and sessions are **never deleted or reassigned**. They are listed in the report; `--hide-legacy` hides them (`is_hidden = 1`) from the demo account selector, course directory/search, tutor directory and People list. Hidden records still resolve by id so old content keeps its author. Admin accounts are never hidden.
- All-or-nothing: any validation error writes nothing. Writes happen in a single transaction. Repeat imports are idempotent.
- Database changes are backward compatible: `tutors.is_active` is added in place (default 1) when the app or importer opens an older database.

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

## Review checklist (dry run output)
- "REVOKED" lists each outstanding request and scheduled session of a revoked tutor (upcoming vs past-but-still-scheduled); nothing is cancelled for you.
- "REMOVED" names the student, email, course and previous status of every enrollment link that would be dropped.
- "NEEDS VERIFICATION" lists CIS 3207 and any courses sharing an identical description. No replacement text is ever invented.
- `--hide-legacy` hides only non-admin users and courses absent from the CSVs; it is refused if users.csv is empty.

## Data notes
- Year/major are optional columns; there is no default of year 1 / Computer Science.
- Unresolved before importing real data: the CIS 3207 description (verify the text), and each tutor's `tutoring_subjects` (the old CSV had none).
