// Shared domain types and API contracts for TUnion.
// All content is human-contributed; there are no AI-generated fields.

export type ID = number;
export type ISODateString = string;

export type UserRole = 'student' | 'tutor' | 'ta' | 'admin';

export interface User {
  id: ID;
  name: string;
  email: string;
  role: UserRole;
  major: string;
  year: number;
  bio: string;
  createdAt: ISODateString;
}

export interface Course {
  id: ID;
  code: string; // e.g. "CS101"
  title: string;
  description: string;
  level: 100 | 200 | 300 | 400;
  createdAt: ISODateString;
}

export interface Discussion {
  id: ID;
  courseId: ID;
  authorId: ID;
  title: string;
  body: string;
  isResolved: boolean;
  createdAt: ISODateString;
}

export interface Reply {
  id: ID;
  discussionId: ID;
  authorId: ID;
  body: string;
  isAcceptedAnswer: boolean;
  createdAt: ISODateString;
}

export type ResourceType = 'notes' | 'link' | 'cheatsheet' | 'practice' | 'other';

export interface Resource {
  id: ID;
  courseId: ID;
  authorId: ID;
  title: string;
  description: string;
  type: ResourceType;
  url: string | null;
  createdAt: ISODateString;
}

export interface Tutor {
  id: ID;
  userId: ID;
  headline: string;
  availability: string;
  courseIds: ID[];
  createdAt: ISODateString;
}

export type TutoringRequestStatus = 'open' | 'accepted' | 'completed' | 'cancelled';

export interface TutoringRequest {
  id: ID;
  courseId: ID;
  studentId: ID;
  tutorId: ID | null;
  topic: string;
  details: string;
  status: TutoringRequestStatus;
  createdAt: ISODateString;
}

export interface StudyGroup {
  id: ID;
  courseId: ID;
  creatorId: ID;
  name: string;
  description: string;
  meetingTime: string;
  location: string;
  maxMembers: number;
  memberIds: ID[];
  createdAt: ISODateString;
}

export type HelpRequestStatus = 'open' | 'claimed' | 'resolved';

export interface HelpRequest {
  id: ID;
  courseId: ID;
  authorId: ID;
  title: string;
  body: string;
  status: HelpRequestStatus;
  createdAt: ISODateString;
}

// ---------------- API contracts ----------------

export interface ApiError {
  error: string;
}

/** GET /api/health */
export interface HealthResponse {
  status: 'ok';
  service: 'tunion-api';
  time: ISODateString;
  database: 'ok' | 'error';
  counts?: { users: number; courses: number };
}

/** GET /api/users */
export type ListUsersResponse = { users: User[] };
/** GET /api/users/:id */
export type GetUserResponse = { user: User };

/** GET /api/courses */
export type ListCoursesResponse = { courses: Course[] };
/** GET /api/courses/:id */
export type GetCourseResponse = { course: Course };

/**
 * DEMO AUTH ONLY - NOT SECURE.
 * The client sends the chosen demo user's id in this header. Anyone can set it.
 */
export const DEMO_USER_HEADER = 'x-demo-user-id';

/** GET /api/demo-auth/accounts */
export type ListDemoAccountsResponse = { accounts: User[] };
/** GET /api/me (reads DEMO_USER_HEADER; 401 if missing/unknown) */
export type MeResponse = { user: User };

// Planned endpoints (not implemented yet) will reuse the entity types above.
