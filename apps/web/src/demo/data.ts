import type { StudyGroup } from '@tunion/shared';

export interface Community {
  groups: StudyGroup[];
  downvotes?: Record<string, boolean>;
  enrollments: Record<number, number[]>;
  pastCourses?: Record<number, number[]>;
}
const createdAt = '2026-11-20T09:00:00Z';

export const initialCommunity: Community = {
  groups: [
    { id: 1, courseId: 3, creatorId: 2, name: 'Data Structures study circle', description: 'Bring a practice problem to work through together.', meetingTime: 'Wednesdays, 4 PM', location: 'Library Room 2B', maxMembers: 8, memberIds: [2, 3], createdAt },
    { id: 2, courseId: 1, creatorId: 5, name: 'Programming fundamentals review', description: 'Review loops, functions, and debugging with classmates.', meetingTime: 'Fridays, 3 PM', location: 'CS Lounge', maxMembers: 10, memberIds: [5], createdAt },
  ],
  enrollments: { 1: [1, 2], 2: [3, 4, 2], 3: [5, 7], 4: [8, 10], 5: [1] },
};
