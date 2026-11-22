import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DB_PATH, getDb, closeDb } from './index';
import { UPLOAD_DIR } from '../uploads';

// Repeatable seed: wipes demo tables and re-inserts fixed-ID data.
// `--reset` is accepted for readability; seeding always resets.
const db = getDb();

const users = [
  [1, 'Alex Rivera', 'alex.rivera@demo.tunion.edu', 'student', 'Computer Science', 1, 'First-year, loves Python and still fears pointers.'],
  [2, 'Priya Nair', 'priya.nair@demo.tunion.edu', 'student', 'Computer Science', 2, 'Sophomore. Forming study groups for data structures.'],
  [3, 'Marcus Chen', 'marcus.chen@demo.tunion.edu', 'tutor', 'Computer Science', 4, 'Senior tutor for algorithms and systems. Ex-TA for CS201.'],
  [4, 'Sofia Alvarez', 'sofia.alvarez@demo.tunion.edu', 'tutor', 'Computer Science', 3, 'Junior tutor, databases and web development.'],
  [5, 'Jordan Okafor', 'jordan.okafor@demo.tunion.edu', 'ta', 'Computer Science', 4, 'Teaching assistant for intro programming.'],
  [6, 'Hani Karam', 'dana.whitfield@demo.tunion.edu', 'admin', 'Computer Science', 4, 'Community moderator for the CS department.'],
] as const;

const courses = [
  [1, 'CS101', 'Introduction to Programming', 'Programming fundamentals: variables, control flow, functions, and basic problem solving.', 100],
  [2, 'CS102', 'Object-Oriented Programming', 'Classes, inheritance, polymorphism, and design with objects.', 100],
  [3, 'CS201', 'Data Structures', 'Lists, trees, hash tables, graphs, and their complexity trade-offs.', 200],
  [4, 'CS202', 'Discrete Mathematics for CS', 'Logic, proofs, sets, combinatorics, and graph theory.', 200],
  [5, 'CS301', 'Algorithms', 'Algorithm design paradigms and analysis: divide and conquer, DP, greedy, NP-completeness.', 300],
  [6, 'CS310', 'Computer Organization', 'Number representation, assembly, memory hierarchy, and the processor.', 300],
  [7, 'CS320', 'Operating Systems', 'Processes, threads, scheduling, memory management, and file systems.', 300],
  [8, 'CS330', 'Database Systems', 'Relational model, SQL, normalization, transactions, and indexing.', 300],
  [9, 'CS340', 'Computer Networks', 'Layered protocols, TCP/IP, routing, and application-layer protocols.', 300],
  [10, 'CS350', 'Software Engineering', 'Teamwork, version control, testing, and the software lifecycle.', 300],
] as const;

const enrollments = [
  [1, 1], [1, 2], [2, 3], [2, 4], [2, 2], [3, 5], [3, 7], [4, 8], [4, 10], [5, 1],
];
const tutors = [
  [1, 3, 'Algorithms & OS, patient and example-driven', 'Mon/Wed 4-6pm, Library Room 2B', [3, 5, 7]],
  [2, 4, 'Databases and web dev, bring your queries', 'Tue/Thu 2-4pm, CS Lounge', [1, 8, 10]],
] as const;

// [id, courseId, authorId, title, body, resolved, createdAt]
const discussions = [
  [1, 3, 1, 'Why is my linked list append O(n)?', 'I wrote append() for a singly linked list and my TA says it is O(n). I only add one node, so why is that linear? Is there a way to make it O(1)?', 1, '2026-11-02T09:15:00.000Z'],
  [2, 3, 2, 'Hash table vs balanced BST for a leaderboard', 'We need to store scores and also print them in sorted order. Is a hash table ever the right call here, or should I go straight to a balanced BST?', 0, '2026-11-04T14:30:00.000Z'],
  [3, 5, 3, 'Intuition for the greedy-choice property', 'I can follow the proofs for interval scheduling but I cannot tell when a greedy approach is safe on a new problem. How do you build the intuition?', 0, '2026-11-06T18:05:00.000Z'],
  [4, 1, 1, 'Off-by-one errors in nested for loops', 'My pattern-printing loops are always one row short. Any tips for reasoning about loop bounds?', 1, '2026-11-08T11:20:00.000Z'],
  [5, 7, 3, 'Difference between a process and a thread in practice', 'Lecture says threads share memory and processes do not. When would I actually choose processes?', 0, '2026-11-10T16:45:00.000Z'],
  [6, 8, 4, 'When does a composite index actually help?', 'I created an index on (last_name, first_name) but queries filtering only on first_name are still slow. Why?', 0, '2026-11-12T10:00:00.000Z'],
] as const;

// [id, discussionId, authorId, parentReplyId, body, accepted, createdAt]
const replies = [
  [1, 1, 5, null, 'Your list only stores a head pointer, so append has to walk every node to find the tail. Think about what extra state would let you jump straight to the end.', 0, '2026-11-02T10:00:00.000Z'],
  [2, 1, 1, 1, 'Oh, so I could keep a tail pointer too? Then append is just tail.next = node?', 0, '2026-11-02T10:20:00.000Z'],
  [3, 1, 3, 2, 'Exactly. Just remember to update tail when you remove the last node, that is where most bugs hide.', 0, '2026-11-02T11:05:00.000Z'],
  [4, 1, 2, null, 'A doubly linked list with a tail pointer also gives O(1) removal from the end, if you need it later.', 1, '2026-11-02T12:30:00.000Z'],
  [5, 2, 3, null, 'Hash tables give O(1) lookups but no ordering. For sorted output you would have to sort on every print. A balanced BST (or a heap if you only need the top-k) fits better.', 0, '2026-11-04T15:10:00.000Z'],
  [6, 2, 2, 5, 'We only ever show the top 10, so a min-heap of size 10 might be enough. Thanks!', 0, '2026-11-04T15:40:00.000Z'],
  [7, 3, 5, null, 'Try to find an exchange argument: if an optimal solution differs from the greedy choice, can you swap in the greedy choice without making things worse?', 0, '2026-11-06T19:00:00.000Z'],
  [8, 4, 5, null, 'Write out the first and last iteration by hand. If i < n runs n times, i <= n runs n+1. Checking the boundary values catches most off-by-ones.', 1, '2026-11-08T12:00:00.000Z'],
  [9, 5, 4, null, 'Processes give isolation: a crash in one cannot corrupt another, which is why browsers use one per tab. Threads are cheaper to share data between but need locks.', 0, '2026-11-10T17:30:00.000Z'],
  [10, 6, 3, null, 'Composite indexes follow the leftmost-prefix rule, so (last_name, first_name) cannot help a filter on first_name alone. Add a separate index on first_name.', 0, '2026-11-12T11:00:00.000Z'],
] as const;

// [discussionId, userId]
const discussionVotes = [[1, 2], [1, 3], [1, 5], [2, 1], [2, 3], [3, 2], [4, 2], [5, 1], [6, 1], [6, 2]];
// [replyId, userId]
const replyVotes = [[1, 1], [1, 3], [3, 1], [4, 1], [5, 2], [5, 1], [7, 3], [8, 1], [8, 2], [9, 3], [10, 4]];

// Dates are relative to "today" in JST so the calendar always has upcoming demo data; IDs stay fixed.
const JST_MS = 9 * 3600_000;
const todayJstMidnight = Math.floor((Date.now() + JST_MS) / 86_400_000) * 86_400_000 - JST_MS;
/** UTC ISO instant for HH:MM JST, `days` from today (negative = past). */
const jst = (days: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(todayJstMidnight + days * 86_400_000 + (h * 60 + m) * 60_000).toISOString();
};

// [id, tutorId, dayOfWeek(0=Sun), start, end, locationType]
const slots = [
  [1, 1, 1, '16:00', '18:00', 'city_campus'],
  [2, 1, 3, '16:00', '18:00', 'city_campus'],
  [3, 1, 6, '10:00', '12:00', 'online'],
  [4, 2, 2, '14:00', '16:00', 'hillside_campus'],
  [5, 2, 4, '14:00', '16:00', 'hillside_campus'],
  [6, 2, 5, '19:00', '21:00', 'online'],
] as const;

// [id, courseId, studentId, tutorId, topic, details, status, slotId, proposal|null, tutorNote]
type Proposal = readonly [startsAt: string, endsAt: string, locationType: string, details: string];
const tutoringRequests: readonly (readonly [number, number, number, number, string, string, string, number | null, Proposal | null, string])[] = [
  [1, 1, 1, 2, 'Recursion practice', 'Stuck on tracing recursive calls for the factorial and fibonacci labs.', 'completed', 4, [jst(-5, '14:00'), jst(-5, '15:00'), 'hillside_campus', 'CS Lounge'], 'Bring your lab 4 code.'],
  [2, 3, 2, 1, 'Heap implementation walkthrough', 'Want to understand sift-down before the midterm.', 'confirmed', 1, [jst(2, '16:00'), jst(2, '17:00'), 'city_campus', 'Library Room 2B'], 'See you there!'],
  [3, 3, 1, 1, 'Hash table collisions', 'Chaining vs open addressing, which one should I use for the project?', 'open', 2, null, ''],
  [4, 5, 2, 1, 'DP intuition', 'How do I identify overlapping subproblems?', 'accepted', 3, [jst(6, '10:00'), jst(6, '11:00'), 'online', 'Video link will be sent in chat'], 'Saturday morning works for me.'],
  [5, 8, 2, 2, 'Transactions and isolation levels', 'Phantom reads confuse me.', 'rejected', null, null, 'Sorry, fully booked this month. Try the CS330 study group.'],
  [6, 8, 1, 2, 'Indexes and query plans', 'Reading EXPLAIN output for the assignment.', 'confirmed', 6, [jst(4, '19:00'), jst(4, '20:00'), 'online', 'Video link will be sent in chat'], ''],
];

// [id, requestId|null, courseId, tutorId, studentId, startsAt, endsAt, locationType, details, status, cancelledById]
const tutoringSessions = [
  [1, 1, 1, 2, 1, jst(-5, '14:00'), jst(-5, '15:00'), 'hillside_campus', 'CS Lounge', 'completed', null],
  [2, 2, 3, 1, 2, jst(2, '16:00'), jst(2, '17:00'), 'city_campus', 'Library Room 2B', 'scheduled', null],
  [3, 6, 8, 2, 1, jst(4, '19:00'), jst(4, '20:00'), 'online', 'Video link will be sent in chat', 'scheduled', null],
  [4, null, 3, 1, 1, jst(1, '16:00'), jst(1, '17:00'), 'city_campus', 'Library Room 2B', 'cancelled', 1],
] as const;

// [id, courseId, creatorId, name, description, meetingTime, location, maxMembers, memberIds]
const studyGroups = [
  [1, 3, 2, 'Data Structures Study Circle', 'Weekly problem-solving for CS201: trees, heaps and hashing.', 'Tue/Thu 18:00 JST', 'CS Lounge', 6, [2, 3]],
  [2, 1, 5, 'Intro Programming Help Hour', 'Friendly drop-in for CS101 homework.', 'Mon 12:00 JST', 'Library Room 1A', 8, [5, 1]],
  [3, 5, 3, 'Algorithms Problem Solving', 'Greedy, DP and graph problems from past exams.', 'Wed 19:00 JST', 'Online', 3, [3, 2, 4]],
  [4, 2, 2, 'OOP Design Patterns', 'Working through design pattern exercises for CS102.', 'Fri 17:00 JST', 'Hillside Campus, Room 301', 4, [2]],
] as const;

// [id, groupId, title, startsAt, endsAt, location, status, createdById]
const studyGroupSessions = [
  [1, 1, 'Heaps and priority queues', jst(1, '18:00'), jst(1, '19:30'), 'CS Lounge', 'scheduled', 2],
  [2, 1, 'Hash table deep dive', jst(8, '18:00'), jst(8, '19:30'), 'CS Lounge', 'scheduled', 2],
  [3, 2, 'Loops and functions workshop', jst(3, '12:00'), jst(3, '13:00'), 'Library Room 1A', 'scheduled', 5],
  [4, 3, 'Dynamic programming set 2', jst(2, '19:00'), jst(2, '20:30'), 'Online', 'cancelled', 3],
  [5, 4, 'Observer and Strategy patterns', jst(5, '17:00'), jst(5, '18:30'), 'Hillside Campus, Room 301', 'scheduled', 2],
] as const;

// Demo uploads. Real (tiny) files are written to the gitignored uploads dir so previews/downloads work out of the box.
const pdfBody = 'BT /F1 18 Tf 20 70 Td (CS201 hash table cheat sheet) Tj ET';
const seedFiles: Record<string, Buffer> = {
  'seed-hash-cheatsheet.pdf': Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
      `4 0 obj<</Length ${pdfBody.length}>>stream\n${pdfBody}\nendstream endobj\n` +
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  ),
  'seed-loop-trace.png': Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64',
  ),
  'seed-process-vs-thread.txt': Buffer.from(
    'Process vs thread\n- Processes: separate address spaces, isolated, heavier to create.\n- Threads: share memory, cheaper, need synchronisation.\n', 'utf8',
  ),
};

// [id, courseId, authorId, title, description, type, url, storedName, originalFilename, mime, createdAt]
type SeedResource = readonly [number, number, number, string, string, string, string | null, string | null, string | null, string | null, string];
const resources: readonly SeedResource[] = [
  [1, 3, 2, 'VisuAlgo: data structure animations', 'Step through BST, heap and hash table operations visually.', 'link', 'https://visualgo.net', null, null, null, '2026-11-03T09:00:00.000Z'],
  [2, 3, 3, 'Hash table cheat sheet', 'One page: load factor, collision strategies, and complexity.', 'cheatsheet', null, 'seed-hash-cheatsheet.pdf', 'hash-table-cheatsheet.pdf', 'application/pdf', '2026-11-05T12:00:00.000Z'],
  [3, 1, 5, 'Loop trace diagram', 'How to trace nested loops row by row.', 'notes', null, 'seed-loop-trace.png', 'loop-trace.png', 'image/png', '2026-11-07T08:30:00.000Z'],
  [4, 8, 4, 'SQL practice problems', 'Interactive joins and aggregation exercises with instant feedback.', 'practice', 'https://sqlzoo.net', null, null, null, '2026-11-09T15:00:00.000Z'],
  [5, 5, 3, 'MIT 6.006 lecture notes', 'Clear notes on greedy algorithms and dynamic programming.', 'notes', 'https://ocw.mit.edu', null, null, null, '2026-11-11T10:00:00.000Z'],
  [6, 7, 3, 'Process vs thread summary', 'Quick comparison for the OS midterm.', 'notes', null, 'seed-process-vs-thread.txt', 'process-vs-thread.txt', 'text/plain; charset=utf-8', '2026-11-13T17:00:00.000Z'],
];
// [resourceId, userId]
const resourceVotes = [[1, 1], [1, 3], [2, 1], [2, 2], [2, 5], [3, 2], [4, 1], [5, 2], [5, 4], [6, 2]];

// [id, courseId, creatorId, title, description, startsAt, endsAt, location, max, status, participantIds]
const oneTimeSessions = [
  [1, 3, 2, 'Midterm review cram session', 'Walk through past exam questions on trees and hashing. Bring your questions.', jst(2, '15:00'), jst(2, '17:00'), 'Library Room 3C', 8, 'scheduled', [2, 3]],
  [2, 1, 5, 'Pointers Q&A', 'Open Q&A on references, pointers and memory diagrams.', jst(3, '16:00'), jst(3, '17:00'), 'Online (video link shared in chat)', 10, 'scheduled', [5, 1]],
  [3, 8, 4, 'SQL join workshop', 'Hands-on practice with inner, outer and self joins.', jst(6, '13:00'), jst(6, '14:30'), 'Hillside Campus, Room 204', 2, 'scheduled', [4, 2]],
  [4, 3, 2, 'Graph traversal drop-in', 'Cancelled: moved to the regular study circle.', jst(1, '12:00'), jst(1, '13:00'), 'CS Lounge', 6, 'cancelled', [2]],
] as const;

db.exec('BEGIN');
try {
  for (const t of [
    'reply_votes', 'discussion_votes', 'resource_votes',
    'one_time_session_participants', 'one_time_sessions',
    'study_group_sessions', 'tutoring_sessions', 'tutor_availability_slots',
    'study_group_members', 'study_groups', 'tutoring_requests', 'tutor_courses', 'tutors',
    'help_requests', 'resources', 'replies', 'discussions', 'enrollments', 'courses', 'users',
  ]) db.exec(`DELETE FROM ${t}`);

  const u = db.prepare('INSERT INTO users (id,name,email,role,major,year,bio) VALUES (?,?,?,?,?,?,?)');
  users.forEach((r) => u.run(...r));
  const c = db.prepare('INSERT INTO courses (id,code,title,description,level) VALUES (?,?,?,?,?)');
  courses.forEach((r) => c.run(...r));
  const e = db.prepare('INSERT INTO enrollments (user_id,course_id) VALUES (?,?)');
  enrollments.forEach((r) => e.run(r[0], r[1]));
  const t = db.prepare('INSERT INTO tutors (id,user_id,headline,availability) VALUES (?,?,?,?)');
  const tc = db.prepare('INSERT INTO tutor_courses (tutor_id,course_id) VALUES (?,?)');
  tutors.forEach(([id, uid, h, a, cs]) => {
    t.run(id, uid, h, a);
    cs.forEach((cid) => tc.run(id, cid));
  });
  const d = db.prepare('INSERT INTO discussions (id,course_id,author_id,title,body,is_resolved,created_at) VALUES (?,?,?,?,?,?,?)');
  discussions.forEach((r) => d.run(...r));
  const rp = db.prepare('INSERT INTO replies (id,discussion_id,author_id,parent_reply_id,body,is_accepted_answer,created_at) VALUES (?,?,?,?,?,?,?)');
  replies.forEach((r) => rp.run(...r));
  const dv = db.prepare('INSERT INTO discussion_votes (discussion_id,user_id) VALUES (?,?)');
  discussionVotes.forEach((r) => dv.run(r[0], r[1]));
  const rv = db.prepare('INSERT INTO reply_votes (reply_id,user_id) VALUES (?,?)');
  replyVotes.forEach((r) => rv.run(r[0], r[1]));
  const sl = db.prepare('INSERT INTO tutor_availability_slots (id,tutor_id,day_of_week,start_time,end_time,location_type) VALUES (?,?,?,?,?,?)');
  slots.forEach((r) => sl.run(...r));
  const tr = db.prepare(`INSERT INTO tutoring_requests
    (id,course_id,student_id,tutor_id,topic,details,status,slot_id,proposed_starts_at,proposed_ends_at,proposed_location_type,proposed_location_details,tutor_note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  tutoringRequests.forEach(([id, cid, sid, tid, topic, details, status, slot, p, note]) =>
    tr.run(id, cid, sid, tid, topic, details, status, slot, p?.[0] ?? null, p?.[1] ?? null, p?.[2] ?? null, p?.[3] ?? '', note));
  const ts = db.prepare(`INSERT INTO tutoring_sessions
    (id,request_id,course_id,tutor_id,student_id,starts_at,ends_at,location_type,location_details,status,cancelled_by_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  tutoringSessions.forEach((r) => ts.run(...r));
  const sg = db.prepare('INSERT INTO study_groups (id,course_id,creator_id,name,description,meeting_time,location,max_members) VALUES (?,?,?,?,?,?,?,?)');
  const sgm = db.prepare('INSERT INTO study_group_members (group_id,user_id) VALUES (?,?)');
  studyGroups.forEach(([id, cid, creator, name, desc, time, loc, max, members]) => {
    sg.run(id, cid, creator, name, desc, time, loc, max);
    members.forEach((m) => sgm.run(id, m));
  });
  const sgs = db.prepare('INSERT INTO study_group_sessions (id,group_id,title,starts_at,ends_at,location,status,created_by_id) VALUES (?,?,?,?,?,?,?,?)');
  studyGroupSessions.forEach((r) => sgs.run(...r));
  const rs = db.prepare(`INSERT INTO resources (id,course_id,author_id,title,description,type,url,stored_name,original_filename,mime_type,size_bytes,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  resources.forEach(([id, cid, aid, title, desc, type, url, stored, original, mime, created]) =>
    rs.run(id, cid, aid, title, desc, type, url, stored, original, mime, stored ? seedFiles[stored].length : null, created));
  const rvote = db.prepare('INSERT INTO resource_votes (resource_id,user_id) VALUES (?,?)');
  resourceVotes.forEach((r) => rvote.run(r[0], r[1]));
  const ot = db.prepare(`INSERT INTO one_time_sessions
    (id,course_id,creator_id,title,description,starts_at,ends_at,location,max_participants,status) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const otp = db.prepare('INSERT INTO one_time_session_participants (session_id,user_id) VALUES (?,?)');
  oneTimeSessions.forEach(([id, cid, creator, title, desc, starts, ends, loc, max, status, people]) => {
    ot.run(id, cid, creator, title, desc, starts, ends, loc, max, status);
    people.forEach((p) => otp.run(id, p));
  });
  mkdirSync(UPLOAD_DIR, { recursive: true });
  for (const [name, data] of Object.entries(seedFiles)) writeFileSync(join(UPLOAD_DIR, name), data);
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

console.log(`Seeded ${users.length} users, ${courses.length} courses, ${tutors.length} tutors, ${discussions.length} discussions, ${replies.length} replies, ${slots.length} availability slots, ${tutoringSessions.length} tutoring sessions, ${studyGroups.length} study groups, ${resources.length} resources, ${oneTimeSessions.length} one-time sessions into ${DB_PATH}`);
closeDb();
