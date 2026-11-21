import { DB_PATH, getDb, closeDb } from './index';

// Repeatable seed: wipes demo tables and re-inserts fixed-ID data.
// `--reset` is accepted for readability; seeding always resets.
const db = getDb();

const users = [
  [1, 'Alex Rivera', 'alex.rivera@demo.tunion.edu', 'student', 'Computer Science', 1, 'First-year, loves Python and still fears pointers.'],
  [2, 'Priya Nair', 'priya.nair@demo.tunion.edu', 'student', 'Computer Science', 2, 'Sophomore. Forming study groups for data structures.'],
  [3, 'Marcus Chen', 'marcus.chen@demo.tunion.edu', 'tutor', 'Computer Science', 4, 'Senior tutor for algorithms and systems. Ex-TA for CS201.'],
  [4, 'Sofia Alvarez', 'sofia.alvarez@demo.tunion.edu', 'tutor', 'Computer Science', 3, 'Junior tutor, databases and web development.'],
  [5, 'Jordan Okafor', 'jordan.okafor@demo.tunion.edu', 'ta', 'Computer Science', 4, 'Teaching assistant for intro programming.'],
  [6, 'Dana Whitfield', 'dana.whitfield@demo.tunion.edu', 'admin', 'Computer Science', 4, 'Community moderator for the CS department.'],
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

db.exec('BEGIN');
try {
  for (const t of [
    'reply_votes', 'discussion_votes',
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
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

console.log(`Seeded ${users.length} users, ${courses.length} courses, ${tutors.length} tutors, ${discussions.length} discussions, ${replies.length} replies into ${DB_PATH}`);
closeDb();
