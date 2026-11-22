# Admin tools and profile-based tutor booking

## Admin (demo account `Hani Karam`, role `admin`)
| Action | Endpoint | Notes |
|---|---|---|
| Delete a discussion | `DELETE /api/admin/discussions/:id` | Soft delete (`discussions.deleted_at`, `deleted_by_id`). Replies, votes and users are kept. Feeds omit it; `GET /api/discussions/:id` answers **410**. |
| See what revoking a badge leaves behind | `GET /api/admin/users/:id/tutor-impact` | Open/accepted requests and upcoming sessions for that tutor. |
| Grant / revoke Tutor badge | `PUT /api/admin/users/:id/tutor-badge` `{ "isTutor": true\|false }` | Sets `tutors.is_active`. Re-granting restores the old subjects and availability. Never changes `users.role`; admin targets are rejected. |

Revoking removes the tutor from the directory and blocks new requests. History is kept, and nothing is auto-cancelled: existing requests can still be answered, and the response/confirm dialog lists what needs follow-up.

## Authorization and its limits
Every `/api/admin/*` route runs `requireAdmin`, which looks the caller up in the database and checks `role = 'admin'`; hiding buttons in React is only a convenience. **Identity is the insecure demo header `x-demo-user-id`**: anyone who sends the admin's id *is* the admin. This is demo authorization, not authentication.

## Booking from a profile
- A profile with an active Tutor badge shows **Book Tutoring Session** (hidden on your own profile; your own profile shows "Manage my tutor settings"). It opens `/tutoring/:tutorId#book`, the existing request form for that tutor.
- `POST /api/tutoring-requests` rejects: self-booking (400), unknown tutor (404), inactive tutor (400), a tutor with no subjects (400), a course they don't tutor (400), a tutor with no weekly availability (400), and a second pending (open/accepted) request from the same student to the same tutor for the same course (409).
- Tutors set subjects with `PUT /api/tutors/me/subjects` (UI: Tutoring → "Manage my subjects and availability"). Subjects are never inferred from courses taken. Own profile: `GET /api/tutors/me`.

## Applying to the existing database
Nothing to run by hand. On the next API start, `migrate()`:
1. adds `discussions.deleted_at` / `deleted_by_id` (nullable);
2. renames the admin `Dana Whitfield` to `Hani Karam` only where `role = 'admin'` and the name still matches (idempotent; id, email and role are kept; the email stays `dana.whitfield@demo.tunion.edu` because it is an identifier).

Back up first: `cp apps/api/data/tunion.db ~/Documents/TUnionBackups/before-admin-tools.db`. Never run `db:seed` or `db:reset` on the imported database.
