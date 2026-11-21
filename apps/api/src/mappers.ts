import type { Course, DiscussionSummary, ThreadedReply, User, UserRole } from '@tunion/shared';

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
