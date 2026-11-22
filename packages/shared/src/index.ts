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

/**
 * Request lifecycle: open -> accepted (tutor approved + proposed meeting details) -> confirmed (student confirmed,
 * a TutoringSession now exists). open -> rejected (tutor declined). open/accepted -> cancelled (student withdrew).
 * 'completed' / 'cancelled' also mirror the linked session once it finishes or is cancelled.
 */
export type TutoringRequestStatus = 'open' | 'accepted' | 'confirmed' | 'rejected' | 'completed' | 'cancelled';

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

/** GET /api/courses supports optional query params: `q` (code/title/description search) and `level` (100|200|300|400). */

// ---------------- Discussions & replies ----------------

export interface AuthorSummary {
  id: ID;
  name: string;
  role: UserRole;
}

/** A discussion plus aggregates. `hasUpvoted` reflects the demo user in DEMO_USER_HEADER (false if none). */
export interface DiscussionSummary extends Discussion {
  author: AuthorSummary;
  upvoteCount: number;
  replyCount: number;
  hasUpvoted: boolean;
}

/** A reply in a thread. `replies` holds direct children (nested tree); `parentReplyId` is null for top-level replies. */
export interface ThreadedReply extends Reply {
  parentReplyId: ID | null;
  author: AuthorSummary;
  upvoteCount: number;
  hasUpvoted: boolean;
  replies: ThreadedReply[];
}

/**
 * GET /api/discussions
 * Query: courseId?, q?, resolved? ('true'|'false'), sort? ('recent'|'top'), limit? (1-100, default 50), offset?
 */
export type ListDiscussionsResponse = { discussions: DiscussionSummary[] };

/** POST /api/discussions (requires demo user). title 3-200 chars, body 1-10000 chars. */
export interface CreateDiscussionRequest {
  courseId: ID;
  title: string;
  body: string;
}
export type CreateDiscussionResponse = { discussion: DiscussionSummary };

/** GET /api/discussions/:id - includes the nested reply tree, oldest first. */
export type GetDiscussionResponse = { discussion: DiscussionSummary; replies: ThreadedReply[] };

/** POST /api/discussions/:id/replies (requires demo user). body 1-10000 chars. */
export interface CreateReplyRequest {
  body: string;
  parentReplyId?: ID | null;
}
export type CreateReplyResponse = { reply: ThreadedReply };

/**
 * POST (add) / DELETE (remove) /api/discussions/:id/upvote and /api/replies/:id/upvote.
 * Requires demo user. A second POST by the same user is 409; own content cannot be upvoted (403).
 */
export type VoteResponse = { upvoteCount: number; hasUpvoted: boolean };

/**
 * POST (mark) / DELETE (unmark) /api/replies/:id/accept.
 * Allowed for the discussion author or a tutor/ta/admin. Only one accepted reply per discussion.
 */
export type AcceptReplyResponse = { discussion: DiscussionSummary; reply: ThreadedReply };

// ---------------- Time zones ----------------
// All instants are stored and returned as UTC ISO-8601 strings ending in "Z" (e.g. 2026-11-23T05:00:00.000Z).
// Every instant also comes with a Japan Standard Time rendering (+09:00, no DST) so the UI can display it directly.
// Weekly availability slots are wall-clock times in JST ("HH:MM"), not instants.

export const APP_TIME_ZONE = 'Asia/Tokyo' as const;
export type AppTimeZone = typeof APP_TIME_ZONE;

export interface TimeRange {
  startsAt: ISODateString; // UTC
  endsAt: ISODateString; // UTC
  startsAtJst: ISODateString; // same instants, "+09:00" offset
  endsAtJst: ISODateString;
  timeZone: AppTimeZone;
}

export type LocationType = 'city_campus' | 'hillside_campus' | 'online';
export const LOCATION_TYPES: readonly LocationType[] = ['city_campus', 'hillside_campus', 'online'];
export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  city_campus: 'City Campus',
  hillside_campus: 'Hillside Campus',
  online: 'Online',
};

export interface MeetingDetails extends TimeRange {
  locationType: LocationType;
  /** Free text, e.g. "Library Room 2B" or a video-call link. May be empty. */
  locationDetails: string;
}

// ---------------- Tutors & weekly availability ----------------

/** 0 = Sunday ... 6 = Saturday (matches JS Date#getDay). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface AvailabilitySlot {
  id: ID;
  tutorId: ID; // Tutor.id
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:MM" 24h, JST
  endTime: string; // "HH:MM" 24h, JST, strictly after startTime
  locationType: LocationType;
  timeZone: AppTimeZone;
  createdAt: ISODateString;
}

export interface TutorProfile extends Tutor {
  user: AuthorSummary;
  slots: AvailabilitySlot[]; // ordered by day, start time
}

/** GET /api/tutors?courseId= */
export type ListTutorsResponse = { tutors: TutorProfile[] };
/** GET /api/tutors/:id */
export type GetTutorResponse = { tutor: TutorProfile };

/** GET /api/tutors/me/availability - the signed-in tutor's own slots (403 if the demo user has no tutor profile). */
export type ListAvailabilityResponse = { slots: AvailabilitySlot[] };

/** POST /api/tutors/me/availability. Overlapping slots on the same day are rejected (409). */
export interface CreateAvailabilitySlotRequest {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  locationType: LocationType;
}
export type CreateAvailabilitySlotResponse = { slot: AvailabilitySlot };

/** PATCH /api/tutors/me/availability/:slotId - any subset of fields; the result is re-validated. */
export type UpdateAvailabilitySlotRequest = Partial<CreateAvailabilitySlotRequest>;
export type UpdateAvailabilitySlotResponse = { slot: AvailabilitySlot };

/** DELETE /api/tutors/me/availability/:slotId (403 if the slot belongs to another tutor). */
export type DeleteResponse = { deleted: true; id: ID };

// ---------------- Tutoring requests ----------------

export interface TutoringRequestDetail extends TutoringRequest {
  student: AuthorSummary;
  tutor: AuthorSummary | null; // the tutor's user account
  courseCode: string;
  slotId: ID | null; // availability slot the student asked about, if any
  /** Set once the tutor approves (status accepted/confirmed/...). */
  proposal: MeetingDetails | null;
  tutorNote: string; // approval/rejection note from the tutor
  sessionId: ID | null; // set once confirmed
  updatedAt: ISODateString;
}

/** POST /api/tutoring-requests (student). The tutor must teach the course. */
export interface CreateTutoringRequestRequest {
  courseId: ID;
  tutorId: ID; // Tutor.id
  topic: string; // 3-200 chars
  details?: string; // <= 5000 chars
  slotId?: ID | null; // must belong to that tutor
}
export type CreateTutoringRequestResponse = { request: TutoringRequestDetail };

/**
 * GET /api/tutoring-requests?role=student|tutor&status=
 * Requests the signed-in user sent (role=student) and/or received as a tutor (role=tutor). Both when omitted.
 */
export type ListTutoringRequestsResponse = { requests: TutoringRequestDetail[] };
/** GET /api/tutoring-requests/:id - participants only. */
export type GetTutoringRequestResponse = { request: TutoringRequestDetail };

/** POST /api/tutoring-requests/:id/approve (the requested tutor; open -> accepted). startsAt/endsAt need a UTC offset. */
export interface ApproveTutoringRequestRequest {
  startsAt: ISODateString;
  endsAt: ISODateString;
  locationType: LocationType;
  locationDetails?: string;
  note?: string;
}
/** POST /api/tutoring-requests/:id/reject (the requested tutor; open -> rejected). */
export interface RejectTutoringRequestRequest {
  note?: string;
}
/** POST /api/tutoring-requests/:id/cancel (the student; open/accepted -> cancelled). No body. */
export type TutoringRequestResponse = { request: TutoringRequestDetail };
/** POST /api/tutoring-requests/:id/confirm (the student; accepted -> confirmed, creates the session). No body. */
export type ConfirmTutoringRequestResponse = { request: TutoringRequestDetail; session: TutoringSession };

// ---------------- Tutoring sessions ----------------

/** scheduled -> completed (tutor, only after it has started) | scheduled -> cancelled (either participant). Terminal otherwise. */
export type TutoringSessionStatus = 'scheduled' | 'completed' | 'cancelled';

export interface TutoringSession extends MeetingDetails {
  id: ID;
  requestId: ID | null;
  courseId: ID;
  courseCode: string;
  courseTitle: string;
  tutorId: ID; // Tutor.id
  tutor: AuthorSummary; // participants
  student: AuthorSummary;
  status: TutoringSessionStatus;
  cancelledById: ID | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** GET /api/tutoring-sessions?status= - sessions the signed-in user participates in (as student or tutor). */
export type ListTutoringSessionsResponse = { sessions: TutoringSession[] };
/** GET /api/tutoring-sessions/:id (participants only); POST /:id/complete (tutor); POST /:id/cancel (participant). */
export type TutoringSessionResponse = { session: TutoringSession };

// ---------------- Study groups & calendar ----------------

/** GET /api/study-groups?courseId= (read-only browse). */
export type ListStudyGroupsResponse = { studyGroups: StudyGroup[] };
/** GET /api/study-groups/:id */
export type GetStudyGroupResponse = { studyGroup: StudyGroup };

export type StudyGroupSessionStatus = 'scheduled' | 'cancelled';

export interface StudyGroupSession extends TimeRange {
  id: ID;
  groupId: ID;
  groupName: string;
  courseId: ID;
  courseCode: string;
  title: string;
  location: string;
  status: StudyGroupSessionStatus;
  createdById: ID;
  /** Whether the signed-in user belongs to the group. */
  isMember: boolean;
  createdAt: ISODateString;
}

/** POST /api/study-groups/:id/sessions (group creator only). Must start in the future, max 12h long. */
export interface CreateStudyGroupSessionRequest {
  title: string; // 3-200 chars
  startsAt: ISODateString;
  endsAt: ISODateString;
  location?: string; // defaults to the group's location
}
/** GET /api/study-groups/:id/sessions (earliest first, includes cancelled); POST creates; POST /api/study-group-sessions/:id/cancel (creator). */
export type ListStudyGroupSessionsResponse = { sessions: StudyGroupSession[] };
export type StudyGroupSessionResponse = { session: StudyGroupSession };

/** The resolved query window: UTC instants plus their JST renderings. `from` is inclusive, `to` exclusive. */
export interface CalendarRange {
  from: ISODateString;
  to: ISODateString;
  fromJst: ISODateString;
  toJst: ISODateString;
  timeZone: AppTimeZone;
}

/**
 * GET /api/calendar/tutoring?from=&to=&status=  (requires demo user)
 * The signed-in user's tutoring sessions (as student or tutor) overlapping [from, to), earliest first.
 * from/to: full ISO instants with an offset, or YYYY-MM-DD (interpreted as JST midnight).
 * Defaults: from = now, to = from + 60 days (max window 366 days). status defaults to scheduled + completed.
 */
export type TutoringCalendarResponse = { range: CalendarRange; sessions: TutoringSession[] };

/**
 * GET /api/calendar/study-groups?from=&to=&scope=mine|discover  (requires demo user)
 * mine (default): scheduled sessions of groups the user belongs to.
 * discover: scheduled sessions of groups the user has NOT joined, for courses they are enrolled in, with space left.
 */
export type StudyGroupCalendarResponse = { range: CalendarRange; sessions: StudyGroupSession[] };

// Planned endpoints (not implemented yet) will reuse the entity types above.
