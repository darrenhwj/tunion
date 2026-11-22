import { Router } from 'express';
import type {
  AcceptReplyResponse, CreateDiscussionResponse, CreateReplyResponse, DiscussionSummary,
  GetDiscussionResponse, ListDiscussionsResponse, ThreadedReply,
} from '@tunion/shared';
import { getDb } from '../db';
import { toDiscussionSummary, toThreadedReply } from '../mappers';
import { DISCUSSION_VOTE, REPLY_VOTE, addVote, removeVote } from '../votes';
import {
  HttpError, bodyObject, likePattern, optionalDemoUser, parseId, queryInt, queryString, requireDemoUser, str,
} from '../http';

export const discussionsRouter = Router();
export const repliesRouter = Router();

discussionsRouter.use(optionalDemoUser);
repliesRouter.use(optionalDemoUser);

const SUMMARY_SELECT = `
  SELECT d.*, u.name AS author_name, u.role AS author_role,
    (SELECT COUNT(*) FROM discussion_votes v WHERE v.discussion_id = d.id) AS upvote_count,
    (SELECT COUNT(*) FROM replies r WHERE r.discussion_id = d.id) AS reply_count,
    EXISTS (SELECT 1 FROM discussion_votes v WHERE v.discussion_id = d.id AND v.user_id = :viewer) AS has_upvoted
  FROM discussions d JOIN users u ON u.id = d.author_id`;

const REPLY_SELECT = `
  SELECT r.*, u.name AS author_name, u.role AS author_role,
    (SELECT COUNT(*) FROM reply_votes v WHERE v.reply_id = r.id) AS upvote_count,
    EXISTS (SELECT 1 FROM reply_votes v WHERE v.reply_id = r.id AND v.user_id = :viewer) AS has_upvoted
  FROM replies r JOIN users u ON u.id = r.author_id`;

function loadDiscussion(id: number, viewer: number): DiscussionSummary {
  const row = getDb().prepare(`${SUMMARY_SELECT} WHERE d.id = :id`).get({ id, viewer });
  if (!row) throw new HttpError(404, 'Discussion not found');
  return toDiscussionSummary(row);
}

function loadReply(id: number, viewer: number): ThreadedReply {
  const row = getDb().prepare(`${REPLY_SELECT} WHERE r.id = :id`).get({ id, viewer });
  if (!row) throw new HttpError(404, 'Reply not found');
  return toThreadedReply(row);
}

function buildTree(discussionId: number, viewer: number): ThreadedReply[] {
  const rows = getDb()
    .prepare(`${REPLY_SELECT} WHERE r.discussion_id = :id ORDER BY r.created_at, r.id`)
    .all({ id: discussionId, viewer });
  const byId = new Map<number, ThreadedReply>();
  const roots: ThreadedReply[] = [];
  const nodes = rows.map(toThreadedReply);
  nodes.forEach((n) => byId.set(n.id, n));
  for (const n of nodes) {
    const parent = n.parentReplyId === null ? undefined : byId.get(n.parentReplyId);
    (parent ? parent.replies : roots).push(n);
  }
  return roots;
}

const viewerId = (req: { demoUser?: { id: number } }) => req.demoUser?.id ?? 0;

// GET /api/discussions?courseId=&q=&resolved=&sort=&limit=&offset=
discussionsRouter.get('/', (req, res) => {
  const where: string[] = [];
  const params: Record<string, string | number> = { viewer: viewerId(req) };
  if (req.query.courseId !== undefined) {
    where.push('d.course_id = :courseId');
    params.courseId = parseId(req.query.courseId, 'courseId');
  }
  const q = queryString(req.query.q, 'q');
  if (q) {
    where.push("(d.title LIKE :q ESCAPE '\\' OR d.body LIKE :q ESCAPE '\\')");
    params.q = likePattern(q);
  }
  const resolved = queryString(req.query.resolved, 'resolved', 5);
  if (resolved !== undefined) {
    if (resolved !== 'true' && resolved !== 'false') throw new HttpError(400, "resolved must be 'true' or 'false'");
    where.push('d.is_resolved = :resolved');
    params.resolved = resolved === 'true' ? 1 : 0;
  }
  const sort = queryString(req.query.sort, 'sort', 10) ?? 'recent';
  if (sort !== 'recent' && sort !== 'top') throw new HttpError(400, "sort must be 'recent' or 'top'");
  params.limit = queryInt(req.query.limit, 'limit', 1, 100, 50);
  params.offset = queryInt(req.query.offset, 'offset', 0, 1_000_000, 0);
  const order = sort === 'top' ? 'upvote_count DESC, d.created_at DESC, d.id DESC' : 'd.created_at DESC, d.id DESC';
  const sql = `${SUMMARY_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT :limit OFFSET :offset`;
  const rows = getDb().prepare(sql).all(params);
  res.json({ discussions: rows.map(toDiscussionSummary) } satisfies ListDiscussionsResponse);
});

// POST /api/discussions
discussionsRouter.post('/', requireDemoUser, (req, res) => {
  const body = bodyObject(req.body);
  const courseId = parseId(body.courseId, 'courseId');
  const title = str(body, 'title', 3, 200);
  const text = str(body, 'body', 1, 10_000);
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM courses WHERE id = ?').get(courseId)) throw new HttpError(404, 'Course not found');
  const { lastInsertRowid } = db
    .prepare('INSERT INTO discussions (course_id, author_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(courseId, req.demoUser!.id, title, text, new Date().toISOString());
  res.status(201).json({ discussion: loadDiscussion(Number(lastInsertRowid), req.demoUser!.id) } satisfies CreateDiscussionResponse);
});

// GET /api/discussions/:id
discussionsRouter.get('/:id', (req, res) => {
  const id = parseId(req.params.id, 'discussion id');
  const viewer = viewerId(req);
  res.json({ discussion: loadDiscussion(id, viewer), replies: buildTree(id, viewer) } satisfies GetDiscussionResponse);
});

// POST /api/discussions/:id/replies
discussionsRouter.post('/:id/replies', requireDemoUser, (req, res) => {
  const id = parseId(req.params.id, 'discussion id');
  const body = bodyObject(req.body);
  const text = str(body, 'body', 1, 10_000);
  const parentReplyId = body.parentReplyId == null ? null : parseId(body.parentReplyId, 'parentReplyId');
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM discussions WHERE id = ?').get(id)) throw new HttpError(404, 'Discussion not found');
  if (parentReplyId !== null) {
    const parent = db.prepare('SELECT discussion_id FROM replies WHERE id = ?').get(parentReplyId) as { discussion_id: number } | undefined;
    if (!parent) throw new HttpError(404, 'Parent reply not found');
    if (parent.discussion_id !== id) throw new HttpError(400, 'Parent reply belongs to a different discussion');
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO replies (discussion_id, author_id, body, parent_reply_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.demoUser!.id, text, parentReplyId, new Date().toISOString());
  res.status(201).json({ reply: loadReply(Number(lastInsertRowid), req.demoUser!.id) } satisfies CreateReplyResponse);
});

// ---------- upvotes ----------

discussionsRouter.post('/:id/upvote', requireDemoUser, addVote(DISCUSSION_VOTE, 'discussion'));
discussionsRouter.delete('/:id/upvote', requireDemoUser, removeVote(DISCUSSION_VOTE, 'discussion'));
repliesRouter.post('/:id/upvote', requireDemoUser, addVote(REPLY_VOTE, 'reply'));
repliesRouter.delete('/:id/upvote', requireDemoUser, removeVote(REPLY_VOTE, 'reply'));

// ---------- helpful-answer marking ----------

function setAccepted(accept: boolean) {
  return (req: import('express').Request, res: import('express').Response) => {
    const id = parseId(req.params.id, 'reply id');
    const user = req.demoUser!;
    const db = getDb();
    const reply = db.prepare('SELECT id, discussion_id FROM replies WHERE id = ?').get(id) as { id: number; discussion_id: number } | undefined;
    if (!reply) throw new HttpError(404, 'Reply not found');
    const disc = db.prepare('SELECT author_id FROM discussions WHERE id = ?').get(reply.discussion_id) as { author_id: number };
    if (disc.author_id !== user.id && user.role === 'student') {
      throw new HttpError(403, 'Only the discussion author or a tutor/TA/admin can mark helpful answers');
    }
    db.exec('BEGIN');
    try {
      // Clear any previous accepted answer first so the one-accepted-per-discussion index holds.
      db.prepare('UPDATE replies SET is_accepted_answer = 0 WHERE discussion_id = ?').run(reply.discussion_id);
      if (accept) db.prepare('UPDATE replies SET is_accepted_answer = 1 WHERE id = ?').run(id);
      db.prepare('UPDATE discussions SET is_resolved = ? WHERE id = ?').run(accept ? 1 : 0, reply.discussion_id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.json({ discussion: loadDiscussion(reply.discussion_id, user.id), reply: loadReply(id, user.id) } satisfies AcceptReplyResponse);
  };
}

repliesRouter.post('/:id/accept', requireDemoUser, setAccepted(true));
repliesRouter.delete('/:id/accept', requireDemoUser, setAccepted(false));
