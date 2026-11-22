import type { AuthorSummary, Course, DiscussionSummary, ThreadedReply, User, UserRole } from '@tunion/shared';
import type {
  AvailabilitySlot, DayOfWeek, OneTimeSession, ResourceSummary, ResourceType, LocationType, MeetingDetails, StudyGroup, StudyGroupSession, Tutor, TutorProfile,
  TutoringRequestDetail, TutoringRequestStatus, TutoringSession, TutoringSessionStatus,
} from '@tunion/shared';
import { timeRange } from './time';
import { isPreviewable } from './uploads';

type Row = Record<string, unknown>;

export function toUser(r: Row): User {
  return {
    id: r.id as number,
    name: r.name as string,
    email: r.email as string,
    role: r.role as UserRole,
    major: r.major as string,
    year: r.year as number,
    bio: r.bio as string,
    createdAt: r.created_at as string,
  };
}

export function toCourse(r: Row): Course {
  return {
    id: r.id as number,
    code: r.code as string,
    title: r.title as string,
    description: r.description as string,
    level: r.level as Course['level'],
    createdAt: r.created_at as string,
  };
}

export function toDiscussionSummary(r: Row): DiscussionSummary {
  return {
    id: r.id as number,
    courseId: r.course_id as number,
    authorId: r.author_id as number,
    title: r.title as string,
    body: r.body as string,
    isResolved: r.is_resolved === 1,
    createdAt: r.created_at as string,
    author: { id: r.author_id as number, name: r.author_name as string, role: r.author_role as UserRole },
    upvoteCount: r.upvote_count as number,
    replyCount: r.reply_count as number,
    hasUpvoted: r.has_upvoted === 1,
  };
}

export function toThreadedReply(r: Row): ThreadedReply {
  return {
    id: r.id as number,
    discussionId: r.discussion_id as number,
    authorId: r.author_id as number,
    body: r.body as string,
    isAcceptedAnswer: r.is_accepted_answer === 1,
    createdAt: r.created_at as string,
    parentReplyId: (r.parent_reply_id as number | null) ?? null,
    author: { id: r.author_id as number, name: r.author_name as string, role: r.author_role as UserRole },
    upvoteCount: r.upvote_count as number,
    hasUpvoted: r.has_upvoted === 1,
    replies: [],
  };
}

// ---------------- tutoring & scheduling ----------------

export function toSlot(r: Row): AvailabilitySlot {
  return {
    id: r.id as number,
    tutorId: r.tutor_id as number,
    dayOfWeek: r.day_of_week as DayOfWeek,
    startTime: r.start_time as string,
    endTime: r.end_time as string,
    locationType: r.location_type as LocationType,
    timeZone: 'Asia/Tokyo',
    createdAt: r.created_at as string,
  };
}

export function toTutorProfile(r: Row, courseIds: number[], slots: AvailabilitySlot[]): TutorProfile {
  const tutor: Tutor = {
    id: r.id as number,
    userId: r.user_id as number,
    headline: r.headline as string,
    availability: r.availability as string,
    courseIds,
    createdAt: r.created_at as string,
  };
  return { ...tutor, user: { id: r.user_id as number, name: r.user_name as string, role: r.user_role as UserRole }, slots };
}

/** Row from the REQUEST_SELECT query in routes/tutoringRequests.ts. */
export function toTutoringRequest(r: Row): TutoringRequestDetail {
  const proposal: MeetingDetails | null = r.proposed_starts_at
    ? {
        ...timeRange(r.proposed_starts_at as string, r.proposed_ends_at as string),
        locationType: r.proposed_location_type as LocationType,
        locationDetails: r.proposed_location_details as string,
      }
    : null;
  return {
    id: r.id as number,
    courseId: r.course_id as number,
    courseCode: r.course_code as string,
    studentId: r.student_id as number,
    tutorId: (r.tutor_id as number | null) ?? null,
    topic: r.topic as string,
    details: r.details as string,
    status: r.status as TutoringRequestStatus,
    createdAt: r.created_at as string,
    student: { id: r.student_id as number, name: r.student_name as string, role: r.student_role as UserRole },
    tutor: r.tutor_user_id == null ? null : { id: r.tutor_user_id as number, name: r.tutor_name as string, role: r.tutor_role as UserRole },
    slotId: (r.slot_id as number | null) ?? null,
    proposal,
    tutorNote: r.tutor_note as string,
    sessionId: (r.session_id as number | null) ?? null,
    updatedAt: r.updated_at as string,
  };
}

/** Row from the SESSION_SELECT query in routes/tutoringSessions.ts. */
export function toTutoringSession(r: Row): TutoringSession {
  return {
    id: r.id as number,
    requestId: (r.request_id as number | null) ?? null,
    courseId: r.course_id as number,
    courseCode: r.course_code as string,
    courseTitle: r.course_title as string,
    tutorId: r.tutor_id as number,
    tutor: { id: r.tutor_user_id as number, name: r.tutor_name as string, role: r.tutor_role as UserRole },
    student: { id: r.student_id as number, name: r.student_name as string, role: r.student_role as UserRole },
    ...timeRange(r.starts_at as string, r.ends_at as string),
    locationType: r.location_type as LocationType,
    locationDetails: r.location_details as string,
    status: r.status as TutoringSessionStatus,
    cancelledById: (r.cancelled_by_id as number | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function toStudyGroupSession(r: Row): StudyGroupSession {
  return {
    id: r.id as number,
    groupId: r.group_id as number,
    groupName: r.group_name as string,
    courseId: r.course_id as number,
    courseCode: r.course_code as string,
    title: r.title as string,
    ...timeRange(r.starts_at as string, r.ends_at as string),
    location: r.location as string,
    status: r.status as StudyGroupSession['status'],
    createdById: r.created_by_id as number,
    isMember: r.is_member === 1,
    createdAt: r.created_at as string,
  };
}

export function toStudyGroup(r: Row, memberIds: number[]): StudyGroup {
  return {
    id: r.id as number,
    courseId: r.course_id as number,
    creatorId: r.creator_id as number,
    name: r.name as string,
    description: r.description as string,
    meetingTime: r.meeting_time as string,
    location: r.location as string,
    maxMembers: r.max_members as number,
    memberIds,
    createdAt: r.created_at as string,
  };
}

/** Row from RESOURCE_SELECT in routes/resources.ts. */
export function toResourceSummary(r: Row): ResourceSummary {
  const id = r.id as number;
  const hasFile = r.stored_name != null;
  const mime = r.mime_type as string | null;
  const previewable = hasFile && mime !== null && isPreviewable(mime);
  return {
    id,
    courseId: r.course_id as number,
    courseCode: r.course_code as string,
    authorId: r.author_id as number,
    author: { id: r.author_id as number, name: r.author_name as string, role: r.author_role as UserRole },
    title: r.title as string,
    description: r.description as string,
    type: r.type as ResourceType,
    url: (r.url as string | null) ?? null,
    createdAt: r.created_at as string,
    file: hasFile
      ? { filename: r.original_filename as string, mimeType: mime ?? 'application/octet-stream', sizeBytes: r.size_bytes as number, previewable }
      : null,
    downloadUrl: hasFile ? `/api/resources/${id}/download` : null,
    previewUrl: previewable ? `/api/resources/${id}/preview` : null,
    upvoteCount: r.upvote_count as number,
    hasUpvoted: r.has_upvoted === 1,
  };
}

export function toOneTimeSession(r: Row, participants: AuthorSummary[], viewerId: number): OneTimeSession {
  return {
    id: r.id as number,
    courseId: r.course_id as number,
    courseCode: r.course_code as string,
    courseTitle: r.course_title as string,
    title: r.title as string,
    description: r.description as string,
    ...timeRange(r.starts_at as string, r.ends_at as string),
    location: r.location as string,
    creator: { id: r.creator_id as number, name: r.creator_name as string, role: r.creator_role as UserRole },
    maxParticipants: r.max_participants as number,
    participantCount: participants.length,
    participants,
    isCreator: viewerId !== 0 && r.creator_id === viewerId,
    isParticipant: participants.some((p) => p.id === viewerId),
    status: r.status as OneTimeSession['status'],
    createdAt: r.created_at as string,
  };
}
