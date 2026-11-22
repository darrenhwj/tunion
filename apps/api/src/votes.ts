import type { Request, Response } from 'express';
import type { VoteResponse } from '@tunion/shared';
import { getDb } from './db';
import { HttpError, parseId } from './http';

// Shared upvote handlers. Each target has a (item, user) composite-primary-key table, so a user can vote once per item
// and duplicates are rejected by the database itself, not just by application checks.
export interface VoteTarget {
  table: 'discussion_votes' | 'reply_votes' | 'resource_votes';
  col: 'discussion_id' | 'reply_id' | 'resource_id';
  owner: string; // SELECT author_id ... WHERE id = ?
}

export const DISCUSSION_VOTE: VoteTarget = { table: 'discussion_votes', col: 'discussion_id', owner: 'SELECT author_id FROM discussions WHERE id = ?' };
export const REPLY_VOTE: VoteTarget = { table: 'reply_votes', col: 'reply_id', owner: 'SELECT author_id FROM replies WHERE id = ?' };

function voteCount(t: VoteTarget, id: number): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM ${t.table} WHERE ${t.col} = ?`).get(id) as { n: number }).n;
}

export function addVote(t: VoteTarget, label: string) {
  return (req: Request, res: Response) => {
    const id = parseId(req.params.id, `${label} id`);
    const owner = getDb().prepare(t.owner).get(id) as { author_id: number } | undefined;
    if (!owner) throw new HttpError(404, `${label[0].toUpperCase()}${label.slice(1)} not found`);
    if (owner.author_id === req.demoUser!.id) throw new HttpError(403, 'You cannot upvote your own post');
    // The composite primary key makes this atomic: a duplicate insert is ignored and detected via changes.
    const { changes } = getDb()
      .prepare(`INSERT OR IGNORE INTO ${t.table} (${t.col}, user_id, created_at) VALUES (?, ?, ?)`)
      .run(id, req.demoUser!.id, new Date().toISOString());
    if (changes === 0) throw new HttpError(409, 'You have already upvoted this');
    res.status(201).json({ upvoteCount: voteCount(t, id), hasUpvoted: true } satisfies VoteResponse);
  };
}

export function removeVote(t: VoteTarget, label: string) {
  return (req: Request, res: Response) => {
    const id = parseId(req.params.id, `${label} id`);
    if (!getDb().prepare(t.owner).get(id)) throw new HttpError(404, `${label[0].toUpperCase()}${label.slice(1)} not found`);
    getDb().prepare(`DELETE FROM ${t.table} WHERE ${t.col} = ? AND user_id = ?`).run(id, req.demoUser!.id);
    res.json({ upvoteCount: voteCount(t, id), hasUpvoted: false } satisfies VoteResponse);
  };
}

export const RESOURCE_VOTE: VoteTarget = { table: 'resource_votes', col: 'resource_id', owner: 'SELECT author_id FROM resources WHERE id = ?' };
