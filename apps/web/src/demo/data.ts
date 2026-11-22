import type { Resource, StudyGroup } from '@tunion/shared';

export type DemoResource = Resource & { filename?: string };
export interface Community {
  resources: DemoResource[];
  groups: StudyGroup[];
  downvotes?: Record<string, boolean>;
  enrollments: Record<number, number[]>;
  pastCourses?: Record<number, number[]>;
}
const createdAt = '2026-11-20T09:00:00Z';

export const initialCommunity: Community = {
  resources: [
    { id: 1, courseId: 3, authorId: 2, title: 'Data structures quick reference', description: 'A short reference for arrays, hash maps, and trees.', type: 'cheatsheet', url: 'data:text/plain;charset=utf-8,' + encodeURIComponent('Arrays: access elements by index.\nHash maps: associate keys with values.\nTrees: organize elements into parent-child relationships.'), filename: 'data-structures.txt', createdAt },
    { id: 2, courseId: 1, authorId: 5, title: 'Loop tracing practice', description: 'Practice predicting each loop iteration by hand.', type: 'practice', url: 'data:text/plain;charset=utf-8,' + encodeURIComponent('For each i from 0 to 2, print i and its square. Trace the output by hand.'), filename: 'loop-practice.txt', createdAt },
  ],
  groups: [
    { id: 1, courseId: 3, creatorId: 2, name: 'Data Structures study circle', description: 'Bring a practice problem to work through together.', meetingTime: 'Wednesdays, 4 PM', location: 'Library Room 2B', maxMembers: 8, memberIds: [2, 3], createdAt },
    { id: 2, courseId: 1, creatorId: 5, name: 'Programming fundamentals review', description: 'Review loops, functions, and debugging with classmates.', meetingTime: 'Fridays, 3 PM', location: 'CS Lounge', maxMembers: 10, memberIds: [5], createdAt },
  ],
  enrollments: { 1: [1, 2], 2: [3, 4, 2], 3: [5, 7], 4: [8, 10], 5: [1] },
};
