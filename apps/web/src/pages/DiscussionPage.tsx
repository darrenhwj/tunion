import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AcceptReplyResponse, AdminDeleteDiscussionResponse, CreateReplyRequest, CreateReplyResponse, GetDiscussionResponse, ThreadedReply, VoteResponse } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import ConfirmDialog from '../components/ConfirmDialog';
import { Empty, Field, PageHeading, RequireAccount, dateLabel, field, textLink } from '../components/CommunityUI';
import { useCommunity } from '../demo/community';
import { api, postJson } from '../lib/api';
import { useDemoAuth } from '../lib/demoAuth';
import { fetchDiscussion, guidedBody, readDiscussion, readGuided } from '../lib/discussions';
import { errorMessage, useApiQuery } from '../lib/useApiQuery';
import { AuthorLink } from './DiscussionsPage';

export default function DiscussionPage() {
  const { discussionId = '' } = useParams();
  const query = useApiQuery(discussionId, fetchDiscussion);
  if (!query.data) return query.error ? <><Link to="/discussions" className={textLink}>← Discussions</Link><Empty>{query.error}</Empty></> : <Empty>Loading discussion…</Empty>;
  return <DiscussionThread key={discussionId} thread={query.data} refreshing={query.refreshing} refresh={query.refresh} />;
}

function DiscussionThread({ thread, refreshing, refresh }: { thread: GetDiscussionResponse; refreshing: boolean; refresh: () => void }) {
  const { discussion: post, replies } = thread;
  const { courses } = useCommunity();
  const { current } = useDemoAuth();
  const [saving, setSaving] = useState(false);
  const pending = saving || refreshing;
  const [error, setError] = useState('');
  const [parent, setParent] = useState<ThreadedReply | null>(null);
  const { category, body } = readDiscussion(post.body);
  const course = courses.find((item) => item.id === post.courseId);
  const canAccept = !!current && (current.id === post.authorId || current.role !== 'student');

  async function mutate(change: () => Promise<unknown>, after?: () => void) {
    if (pending) return;
    setSaving(true);
    setError('');
    try {
      await change();
      after?.();
      refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function vote() {
    void mutate(() => api<VoteResponse>('/discussions/' + post.id + '/upvote', { method: post.hasUpvoted ? 'DELETE' : 'POST' }));
  }

  function reply(event: FormEvent<HTMLFormElement>, guided: boolean) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const read = (name: string) => String(form.get(name) ?? '').trim();
    const request: CreateReplyRequest = {
      body: guided ? guidedBody({ hint: read('hint'), explanation: read('explanation'), followUp: read('followUp') }) : read('body'),
      parentReplyId: parent?.id,
    };
    if (request.body.length > 10000) {
      setError('Keep the formatted reply within 10,000 characters.');
      return;
    }
    void mutate(() => postJson<CreateReplyResponse>('/discussions/' + post.id + '/replies', request), () => {
      element.reset();
      setParent(null);
    });
  }

  return <>
    <Link to={course ? '/courses/' + course.id : '/discussions'} className={textLink}>← {course ? course.code + ' discussions' : 'Discussions'}</Link>
    <PageHeading label={category} title={post.title}>{post.isResolved && <Badge tone="brand">Resolved</Badge>}</PageHeading>
    <Card className="space-y-4">
      <p className="text-sm text-ink-500"><AuthorLink author={post.author} /> · {dateLabel(post.createdAt)}</p>
      <p className="whitespace-pre-wrap break-words leading-7">{body}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={post.hasUpvoted ? 'primary' : 'secondary'} disabled={!current || current.id === post.authorId || pending} aria-label="Upvote discussion" aria-pressed={post.hasUpvoted} onClick={vote}>↑</Button>
        {current?.role === 'admin' && <AdminDeleteButton postId={post.id} courseId={post.courseId} />}
        <span aria-live="polite" className="text-sm font-semibold">{post.upvoteCount} {post.upvoteCount === 1 ? 'upvote' : 'upvotes'}</span>
      </div>
    </Card>
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Replies ({post.replyCount})</h2>
      <ReplyList replies={replies} renderActions={(item) => current && <>
        <Button variant="ghost" onClick={() => { setParent(item); document.getElementById('reply-form')?.scrollIntoView(); }}>Reply</Button>
        <Button aria-label={item.hasUpvoted ? 'Remove reply upvote' : 'Upvote reply'} variant={item.hasUpvoted ? 'primary' : 'secondary'} aria-pressed={item.hasUpvoted} disabled={pending || current.id === item.authorId} onClick={() => void mutate(() => api<VoteResponse>('/replies/' + item.id + '/upvote', { method: item.hasUpvoted ? 'DELETE' : 'POST' }))}>↑ {item.upvoteCount}</Button>
        {canAccept && <Button variant="ghost" disabled={pending} onClick={() => void mutate(() => api<AcceptReplyResponse>('/replies/' + item.id + '/accept', { method: item.isAcceptedAnswer ? 'DELETE' : 'POST' }))}>{item.isAcceptedAnswer ? 'Unmark accepted answer' : 'Mark as accepted answer'}</Button>}
      </>} />
      <RequireAccount><ReplyForm parent={parent} cancel={() => setParent(null)} pending={pending} submit={reply} /></RequireAccount>
    </section>
    {error && <p role="alert" className="sticky bottom-3 rounded-lg bg-red-950 p-3 text-sm text-red-200">{error}</p>}
  </>;
}

function ReplyList({ replies, renderActions }: { replies: ThreadedReply[]; renderActions: (item: ThreadedReply) => ReactNode }) {
  return <div className="space-y-3">{replies.map((item) => {
    const guided = readGuided(item.body);
    return <div key={item.id} className="space-y-3">
      <Card className="space-y-3">
        <p className="text-sm text-ink-500"><AuthorLink author={item.author} /> · {dateLabel(item.createdAt)} · {item.upvoteCount} {item.upvoteCount === 1 ? 'upvote' : 'upvotes'}</p>
        {item.isAcceptedAnswer && <Badge tone="brand">Accepted answer</Badge>}
        {guided ? <><Badge tone="brand">Guided Answer</Badge><dl className="space-y-3">
          {([['Hint', guided.hint], ['Explanation', guided.explanation], ['Follow-up question', guided.followUp]] as const).map(([label, value]) => <div key={label}><dt className="text-sm font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm leading-6">{value}</dd></div>)}
        </dl></> : <p className="whitespace-pre-wrap break-words">{item.body}</p>}
        <div className="flex flex-wrap gap-2">{renderActions(item)}</div>
      </Card>
      {item.replies.length > 0 && <div className="border-l border-line pl-2"><ReplyList replies={item.replies} renderActions={renderActions} /></div>}
    </div>;
  })}</div>;
}

function ReplyForm({ parent, cancel, pending, submit }: { parent: ThreadedReply | null; cancel: () => void; pending: boolean; submit: (event: FormEvent<HTMLFormElement>, guided: boolean) => void }) {
  const [guided, setGuided] = useState(false);
  return <Card id="reply-form"><form onSubmit={(event) => submit(event, guided)}><fieldset className="min-w-0 space-y-4" disabled={pending}>
    {parent && <div className="flex flex-wrap items-center gap-2 text-sm">Replying to {parent.author.name}<Button type="button" variant="ghost" onClick={cancel}>Cancel threaded reply</Button></div>}
    <Field label="Reply format"><select className={field} value={guided ? 'guided' : 'reply'} onChange={(event) => setGuided(event.target.value === 'guided')}><option value="reply">Reply</option><option value="guided">Guided Answer</option></select></Field>
    {guided ? <><ReplyField name="hint" label="Hint" /><ReplyField name="explanation" label="Explanation" /><ReplyField name="followUp" label="Follow-up question" /></> : <ReplyField name="body" label="Your reply" />}
    <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Post reply'}</Button>
  </fieldset></form></Card>;
}

function ReplyField({ name, label }: { name: string; label: string }) {
  return <Field label={label}><textarea name={name} className={field} rows={3} required maxLength={10000} onChange={(event) => event.target.setCustomValidity(event.target.value.trim() ? '' : 'Enter ' + label.toLowerCase() + '.')} /></Field>;
}

/** Admin-only. The API re-checks the role; a non-admin who forged this request would get 403. */
function AdminDeleteButton({ postId, courseId }: { postId: number; courseId: number }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api<AdminDeleteDiscussionResponse>('/admin/discussions/' + postId, { method: 'DELETE' });
      navigate('/courses/' + courseId, { replace: true });
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }
  return <>
    <Button type="button" variant="secondary" className="border-red-300 text-red-300" onClick={() => { setError(''); setOpen(true); }}>Delete Post</Button>
    <ConfirmDialog open={open} title="Delete this post?" confirmLabel="Delete post" busy={busy} error={error} onConfirm={() => void remove()} onCancel={() => setOpen(false)}>
      <p>This removes the post from discussions for everyone. Its replies and votes are kept in the database but no longer shown.</p>
    </ConfirmDialog>
  </>;
}
