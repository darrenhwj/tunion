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

db.exec('BEGIN');
try {
  for (const t of [
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
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

console.log(`Seeded ${users.length} users, ${courses.length} courses, ${tutors.length} tutors into ${DB_PATH}`);
closeDb();
