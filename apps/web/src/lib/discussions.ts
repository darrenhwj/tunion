import type { DiscussionSummary, GetDiscussionResponse, ListDiscussionsResponse, ThreadedReply } from '@tunion/shared';
import { api } from './api';

export const categories = ['Question', 'Concepts', 'Assignments', 'Exam prep', 'General'] as const;
export type Category = typeof categories[number];
export interface GuidedAnswer { hint: string; explanation: string; followUp: string }

// The API currently stores free-form text. Keep the category and guided format
// in the server body so they travel with the content to other browsers.
export function discussionBody(body: string, category: Category) {
  return 'Category: ' + category + '\n\n' + body;
}

export function readDiscussion(body: string) {
  const category = categories.find((name) => body.startsWith(discussionBody('', name)));
  return { category: category ?? 'General', body: category ? body.slice(discussionBody('', category).length) : body };
}

const guidedPrefix = 'Guided Answer\n';

export function guidedBody(answer: GuidedAnswer) {
  return guidedPrefix + JSON.stringify(answer);
}

export function readGuided(body: string): GuidedAnswer | undefined {
  if (!body.startsWith(guidedPrefix)) return;
  try {
    const answer: Partial<GuidedAnswer> | null = JSON.parse(body.slice(guidedPrefix.length));
    if (typeof answer?.hint === 'string' && typeof answer.explanation === 'string' && typeof answer.followUp === 'string') {
      return { hint: answer.hint, explanation: answer.explanation, followUp: answer.followUp };
    }
  } catch {
    // Existing plain-text replies may start with the same words.
  }
}

export function fetchDiscussions(query: string, signal: AbortSignal) {
  return api<ListDiscussionsResponse>('/discussions?' + query, { signal });
}

export function fetchDiscussion(id: string, signal: AbortSignal) {
  return api<GetDiscussionResponse>('/discussions/' + encodeURIComponent(id), { signal });
}

export async function fetchAllDiscussions(query: string, signal: AbortSignal) {
  const params = new URLSearchParams(query);
  const items: DiscussionSummary[] = [];
  const limit = 100;
  params.set('limit', String(limit));

  for (let offset = 0; ; offset += limit) {
    params.set('offset', String(offset));
    const { discussions } = await fetchDiscussions(params.toString(), signal);
    items.push(...discussions);
    if (discussions.length < limit) return items;
  }
}

function* flattenReplies(replies: ThreadedReply[]): Generator<ThreadedReply> {
  for (const reply of replies) {
    yield reply;
    yield* flattenReplies(reply.replies);
  }
}

export async function fetchContributions(userId: string, signal: AbortSignal) {
  const all = await fetchAllDiscussions('', signal);
  const posts = new Map(all.map((post) => [post.id, post]));
  const threads = all.filter((post) => post.replyCount > 0);
  const replies: ThreadedReply[] = [];
  // The API has no author filter for replies. Limit concurrent thread reads.
  for (let offset = 0; offset < threads.length; offset += 8) {
    const batch = await Promise.all(threads.slice(offset, offset + 8).map(({ id }) => fetchDiscussion(String(id), signal)));
    for (const thread of batch) {
      for (const reply of flattenReplies(thread.replies)) {
        if (String(reply.authorId) === userId) replies.push(reply);
      }
    }
  }
  return {
    posts,
    discussions: all.filter((post) => String(post.authorId) === userId),
    replies,
  };
}
