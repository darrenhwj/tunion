import type { Discussion, Reply, Resource, StudyGroup, Tutor, TutoringRequest } from '@tunion/shared';

export const categories = ['Question', 'Concepts', 'Assignments', 'Exam prep', 'General'] as const;
export type Category = typeof categories[number];
export interface GuidedAnswer { hint: string; explanation: string; followUp: string }
export type DemoDiscussion = Discussion & { category: Category };
export type DemoReply = Reply & { guided?: GuidedAnswer };
export type DemoResource = Resource & { filename?: string };
export interface Community {
  discussions: DemoDiscussion[];
  replies: DemoReply[];
  resources: DemoResource[];
  requests: TutoringRequest[];
  groups: StudyGroup[];
  votes: Record<string, number>;
  enrollments: Record<number, number[]>;
  pastCourses?: Record<number, number[]>;
}
const createdAt = '2026-11-20T09:00:00Z';

export const initialCommunity: Community = {
  discussions: [
    { id: 1, courseId: 3, authorId: 2, title: 'When should I use a hash map over an array?', body: 'I understand how both store data, but I’m having trouble deciding which one to use when solving practice problems.', category: 'Concepts', isResolved: false, createdAt },
    { id: 2, courseId: 1, authorId: 1, title: 'Getting comfortable with nested loops', body: 'How do you keep track of which loop runs when? I keep mixing up the outer and inner counters.', category: 'Question', isResolved: false, createdAt },
    { id: 3, courseId: 5, authorId: 3, title: 'Dynamic programming practice for the midterm', body: 'Which problems helped you go from writing a recurrence to choosing a table order?', category: 'Exam prep', isResolved: false, createdAt },
  ],
  replies: [],
  resources: [
    { id: 1, courseId: 3, authorId: 2, title: 'Data structures quick reference', description: 'A short reference for arrays, hash maps, and trees.', type: 'cheatsheet', url: 'data:text/plain;charset=utf-8,' + encodeURIComponent('Arrays: access elements by index.\nHash maps: associate keys with values.\nTrees: organize elements into parent-child relationships.'), filename: 'data-structures.txt', createdAt },
    { id: 2, courseId: 1, authorId: 5, title: 'Loop tracing practice', description: 'Practice predicting each loop iteration by hand.', type: 'practice', url: 'data:text/plain;charset=utf-8,' + encodeURIComponent('For each i from 0 to 2, print i and its square. Trace the output by hand.'), filename: 'loop-practice.txt', createdAt },
  ],
  groups: [
    { id: 1, courseId: 3, creatorId: 2, name: 'Data Structures study circle', description: 'Bring a practice problem to work through together.', meetingTime: 'Wednesdays, 4 PM', location: 'Library Room 2B', maxMembers: 8, memberIds: [2, 3], createdAt },
    { id: 2, courseId: 1, creatorId: 5, name: 'Programming fundamentals review', description: 'Review loops, functions, and debugging with classmates.', meetingTime: 'Fridays, 3 PM', location: 'CS Lounge', maxMembers: 10, memberIds: [5], createdAt },
  ],
  requests: [],
  votes: {},
  enrollments: { 1: [1, 2], 2: [3, 4, 2], 3: [5, 7], 4: [8, 10], 5: [1] },
};

export const tutors: Tutor[] = [
  { id: 1, userId: 3, headline: 'Algorithms & OS, patient and example-driven', availability: 'Mon/Wed 4–6 PM, Library Room 2B', courseIds: [3, 5, 7], createdAt },
  { id: 2, userId: 4, headline: 'Databases and web development', availability: 'Tue/Thu 2–4 PM, CS Lounge', courseIds: [1, 8, 10], createdAt },
];
