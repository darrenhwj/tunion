PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('student','tutor','ta','admin')),
  major TEXT NOT NULL DEFAULT 'Computer Science',
  year INTEGER NOT NULL DEFAULT 1,
  bio TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- 1 hides a legacy/demo account from the demo account selector only; the row and its content are kept.
  is_hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- 1 hides a legacy/demo course from the course directory only; the row and its content are kept.
  is_hidden INTEGER NOT NULL DEFAULT 0
);

-- status: 'current' = taking it now, 'completed' = previously taken.
CREATE TABLE IF NOT EXISTS enrollments (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current','completed')),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS discussions (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY,
  discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_accepted_answer INTEGER NOT NULL DEFAULT 0,
  parent_reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One vote per (user, item): the composite primary key prevents duplicate votes.
CREATE TABLE IF NOT EXISTS discussion_votes (
  discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (discussion_id, user_id)
);

CREATE TABLE IF NOT EXISTS reply_votes (
  reply_id INTEGER NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (reply_id, user_id)
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('notes','link','cheatsheet','practice','other')),
  url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Uploaded file metadata (all NULL for link resources). stored_name is a server-generated name inside the uploads dir.
  stored_name TEXT,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER
);

-- One upvote per (resource, user): the composite primary key prevents duplicates at the database level.
CREATE TABLE IF NOT EXISTS resource_votes (
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (resource_id, user_id)
);

CREATE TABLE IF NOT EXISTS tutors (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tutor_courses (
  tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (tutor_id, course_id)
);

-- Weekly recurring availability. Times are JST wall-clock "HH:MM"; day_of_week 0 = Sunday .. 6 = Saturday.
CREATE TABLE IF NOT EXISTS tutor_availability_slots (
  id INTEGER PRIMARY KEY,
  tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL CHECK (end_time > start_time),
  location_type TEXT NOT NULL CHECK (location_type IN ('city_campus','hillside_campus','online')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Instants (proposed_*_at) are UTC ISO-8601 with 'Z'. See db/index.ts for the upgrade of pre-existing tables.
CREATE TABLE IF NOT EXISTS tutoring_requests (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tutor_id INTEGER REFERENCES tutors(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','confirmed','rejected','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  slot_id INTEGER REFERENCES tutor_availability_slots(id) ON DELETE SET NULL,
  proposed_starts_at TEXT,
  proposed_ends_at TEXT,
  proposed_location_type TEXT CHECK (proposed_location_type IN ('city_campus','hillside_campus','online')),
  proposed_location_details TEXT NOT NULL DEFAULT '',
  tutor_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS tutoring_sessions (
  id INTEGER PRIMARY KEY,
  request_id INTEGER UNIQUE REFERENCES tutoring_requests(id) ON DELETE SET NULL,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK (ends_at > starts_at),
  location_type TEXT NOT NULL CHECK (location_type IN ('city_campus','hillside_campus','online')),
  location_details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  cancelled_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS study_groups (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  meeting_time TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  max_members INTEGER NOT NULL DEFAULT 6,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS study_group_members (
  group_id INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS study_group_sessions (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK (ends_at > starts_at),
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
  created_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Standalone, non-recurring study sessions (independent of study_groups). Instants are UTC ISO-8601 with 'Z'.
CREATE TABLE IF NOT EXISTS one_time_sessions (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK (ends_at > starts_at),
  location TEXT NOT NULL,
  max_participants INTEGER NOT NULL DEFAULT 10 CHECK (max_participants BETWEEN 2 AND 50),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS one_time_session_participants (
  session_id INTEGER NOT NULL REFERENCES one_time_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS help_requests (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed','resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_discussions_course ON discussions(course_id);
CREATE INDEX IF NOT EXISTS idx_replies_discussion ON replies(discussion_id);
CREATE INDEX IF NOT EXISTS idx_resources_course ON resources(course_id);
CREATE INDEX IF NOT EXISTS idx_help_course ON help_requests(course_id);
-- At most one accepted (helpful) answer per discussion.
CREATE UNIQUE INDEX IF NOT EXISTS idx_replies_one_accepted ON replies(discussion_id) WHERE is_accepted_answer = 1;
CREATE INDEX IF NOT EXISTS idx_slots_tutor ON tutor_availability_slots(tutor_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_tutoring_sessions_student ON tutoring_sessions(student_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_tutoring_sessions_tutor ON tutoring_sessions(tutor_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_study_group_sessions_group ON study_group_sessions(group_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_one_time_sessions_start ON one_time_sessions(starts_at);
CREATE INDEX IF NOT EXISTS idx_one_time_participants_user ON one_time_session_participants(user_id);
