import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import { CourseSelect, Empty, Field, PageHeading, Person, RequireAccount, action, dateLabel, field, textLink } from '../components/CommunityUI';
import { nextId, useCommunity } from '../demo/community';
import { categories, type Category, type DemoDiscussion } from '../demo/data';
import { useDemoAuth } from '../lib/demoAuth';

export function DiscussionList({ items }: { items: DemoDiscussion[] }) {
  const { courses, data } = useCommunity();
  if (!items.length) return <Empty>No discussions found.</Empty>;
  return <div className="space-y-3">{items.map((post) => {
    const course = courses.find((item) => item.id === post.courseId);
    const replies = data.replies.filter((reply) => reply.discussionId === post.id).length;
    return <Card key={post.id} className="space-y-2">
      <div className="flex flex-wrap gap-2"><Badge tone="brand">{post.category}</Badge>{course && <Badge>{course.code}</Badge>}</div>
      <h2 className="font-bold"><Link className="hover:text-brand-700 hover:underline" to={'/discussions/' + post.id}>{post.title}</Link></h2>
      <p className="line-clamp-2 break-words text-sm text-ink-700">{post.body}</p>
      <p className="text-xs text-ink-500"><Person id={post.authorId} /> · {dateLabel(post.createdAt)} · {replies} {replies === 1 ? 'reply' : 'replies'}</p>
    </Card>;
  })}</div>;
}

export function DiscussionsPage() {
  const { courseId } = useParams();
  const { data } = useCommunity();
  const [courseFilter, setCourseFilter] = useState('');
  const [category, setCategory] = useState('');
  const items = data.discussions.filter((post) => (!(courseId || courseFilter) || String(post.courseId) === (courseId || courseFilter)) && (!category || post.category === category));
  const createLink = '/discussions/new' + (courseId ? '?course=' + courseId : '');
  return <>
    {courseId ? <div className="flex justify-end"><Link className={action} to={createLink}>New discussion</Link></div> : <PageHeading title="Discussions" description="Ask a question or share what you’ve learned."><Link className={action} to={createLink}>New discussion</Link></PageHeading>}
    <div className="grid gap-3 sm:grid-cols-2">
      {!courseId && <Field label="Course"><CourseSelect all value={courseFilter} onChange={setCourseFilter} /></Field>}
      <Field label="Category"><select className={field} value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></Field>
    </div>
    <DiscussionList items={items} />
  </>;
}

export function NewDiscussionPage() {
  const { current } = useDemoAuth();
  const { data, update } = useCommunity();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const course = params.get('course') ?? '';
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title')).trim();
    const body = String(form.get('body')).trim();
    if (!title || !body) return;
    const id = nextId(data.discussions);
    const post: DemoDiscussion = { id, courseId: Number(form.get('courseId')), authorId: current.id, title, body, category: form.get('category') as Category, isResolved: false, createdAt: new Date().toISOString() };
    update((previous) => ({ ...previous, discussions: [post, ...previous.discussions] }));
    navigate('/discussions/' + id);
  }

  return <>
    <Link to={course ? '/courses/' + course : '/discussions'} className={textLink}>← Back to discussions</Link>
    <PageHeading title="New discussion" description="Give classmates enough context to understand your question." />
    <RequireAccount><Card className="max-w-2xl"><form onSubmit={submit} className="space-y-4">
      <Field label="Course"><CourseSelect defaultValue={course} /></Field>
      <Field label="Category"><select name="category" className={field}>{categories.map((name) => <option key={name}>{name}</option>)}</select></Field>
      <Field label="Title"><input name="title" className={field} required pattern=".*\S.*" maxLength={140} /></Field>
      <Field label="Message"><textarea name="body" className={field} rows={6} required onChange={(event) => event.target.setCustomValidity(event.target.value.trim() ? '' : 'Enter a message.')} /></Field>
      <Button type="submit">Post discussion</Button>
    </form></Card></RequireAccount>
  </>;
}

export function DiscussionPage() {
  const { discussionId } = useParams();
  const { data, courses, update } = useCommunity();
  const { current } = useDemoAuth();
  const [guided, setGuided] = useState(false);
  const post = data.discussions.find((item) => String(item.id) === discussionId);
  if (!post) return <Empty>Discussion not found.</Empty>;
  const course = courses.find((item) => item.id === post.courseId);
  const replies = data.replies.filter((item) => item.discussionId === post.id);
  const prefix = post.id + ':';
  const score = Object.entries(data.votes).reduce((sum, [key, vote]) => key.startsWith(prefix) ? sum + vote : sum, 0);
  const myKey = prefix + current?.id;

  function vote(value: number) {
    if (!current) return;
    update((previous) => ({ ...previous, votes: { ...previous.votes, [myKey]: previous.votes[myKey] === value ? 0 : value } }));
  }

  function reply(event: FormEvent<HTMLFormElement>, discussion: DemoDiscussion) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    const read = (name: string) => String(form.get(name) ?? '').trim();
    const answer = guided ? { hint: read('hint'), explanation: read('explanation'), followUp: read('followUp') } : undefined;
    const body = answer?.explanation ?? read('body');
    if (!body || (answer && (!answer.hint || !answer.followUp))) return;
    update((previous) => ({ ...previous, replies: [...previous.replies, { id: nextId(previous.replies), discussionId: discussion.id, authorId: current.id, body, guided: answer, isAcceptedAnswer: false, createdAt: new Date().toISOString() }] }));
    event.currentTarget.reset();
  }

  return <>
    <Link to={course ? '/courses/' + course.id : '/discussions'} className={textLink}>← {course ? course.code + ' discussions' : 'Discussions'}</Link>
    <PageHeading label={post.category} title={post.title} />
    <Card className="space-y-4">
      <p className="text-sm text-ink-500"><Person id={post.authorId} /> · {dateLabel(post.createdAt)}</p>
      <p className="whitespace-pre-wrap break-words leading-7">{post.body}</p>
      <div className="flex items-center gap-2">
        <Button type="button" variant={data.votes[myKey] === 1 ? 'primary' : 'secondary'} disabled={!current} aria-label="Upvote discussion" aria-pressed={data.votes[myKey] === 1} onClick={() => vote(1)}>↑</Button>
        <span aria-live="polite" className="min-w-8 text-center text-sm font-semibold">{score}</span>
        <Button type="button" variant={data.votes[myKey] === -1 ? 'primary' : 'secondary'} disabled={!current} aria-label="Downvote discussion" aria-pressed={data.votes[myKey] === -1} onClick={() => vote(-1)}>↓</Button>
      </div>
    </Card>
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Replies ({replies.length})</h2>
      {replies.map((item) => <Card key={item.id} className="space-y-3">
        <p className="text-sm text-ink-500"><Person id={item.authorId} /> · {dateLabel(item.createdAt)}</p>
        {item.guided ? <><Badge tone="brand">Guided Answer</Badge><dl className="space-y-3">
          {([['Hint', item.guided.hint], ['Explanation', item.guided.explanation], ['Follow-up question', item.guided.followUp]] as const).map(([label, value]) => <div key={label}><dt className="text-sm font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm leading-6">{value}</dd></div>)}
        </dl></> : <p className="whitespace-pre-wrap break-words">{item.body}</p>}
      </Card>)}
      <RequireAccount><Card><form className="space-y-4" onSubmit={(event) => reply(event, post)}>
        <Field label="Reply format"><select className={field} value={guided ? 'guided' : 'reply'} onChange={(event) => setGuided(event.target.value === 'guided')}><option value="reply">Reply</option><option value="guided">Guided Answer</option></select></Field>
        {guided ? <><ReplyField name="hint" label="Hint" /><ReplyField name="explanation" label="Explanation" /><ReplyField name="followUp" label="Follow-up question" /></> : <ReplyField name="body" label="Your reply" />}
        <Button type="submit">Post reply</Button>
      </form></Card></RequireAccount>
    </section>
  </>;
}

function ReplyField({ name, label }: { name: string; label: string }) {
  return <Field label={label}><textarea name={name} className={field} rows={3} required onChange={(event) => event.target.setCustomValidity(event.target.value.trim() ? '' : 'Enter ' + label.toLowerCase() + '.')} /></Field>;
}
