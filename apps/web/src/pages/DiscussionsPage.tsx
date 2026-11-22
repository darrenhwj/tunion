import cpuPhoto from '../assets/photos/discussions/thumb-cpu-socket.webp';
import recursionPhoto from '../assets/photos/discussions/thumb-recursion-code.webp';
import studentsPhoto from '../assets/photos/discussions/temple-students-group.webp';
import treeArt from '../assets/illustrations/discussions/thumb-tree-traversal.svg';
import AccountBadges from '../components/AccountBadges';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { CreateDiscussionRequest, CreateDiscussionResponse, DiscussionSummary } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import Glyph from '../components/Glyph';
import { CourseSelect, Empty, Field, PageHeading, RequireAccount, action, dateLabel, field, textLink } from '../components/CommunityUI';
import { useCommunity } from '../demo/community';
import { postJson } from '../lib/api';
import { categories, discussionBody, fetchAllDiscussions, readDiscussion, type Category } from '../lib/discussions';
import { errorMessage, useApiQuery } from '../lib/useApiQuery';

function topicArtwork(title: string) {
  if (/\b(?:tree|traversal|pre[- ]?order|in[- ]?order|post[- ]?order)\b/i.test(title)) return { src: treeArt, diagram: true };
  if (/\b(?:recursion|recursive)\b/i.test(title)) return { src: recursionPhoto };
  if (/\b(?:cpu|registers?|assembly|stack)\b/i.test(title)) return { src: cpuPhoto };
}

export function DiscussionList({ items, illustrated = false }: { items: DiscussionSummary[]; illustrated?: boolean }) {
  const { courses } = useCommunity();
  if (!items.length) return <Empty>No discussions found.</Empty>;
  return <div className="space-y-3">{items.map((post) => {
    const course = courses.find((item) => item.id === post.courseId);
    const { category, body } = readDiscussion(post.body);
    const artwork = illustrated ? topicArtwork(post.title) : undefined;
    return <article key={post.id} className={illustrated ? 'discussion-facet' : 'rounded-xl border border-line bg-surface p-5'}>
      <div className={'mb-3 flex flex-wrap gap-2 ' + (illustrated ? 'justify-end' : '')}>
        <Badge tone="brand">{category}</Badge>{course && <Badge>{course.code}</Badge>}{post.isResolved && <Badge>Resolved</Badge>}
      </div>
      <div className={artwork ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-4 sm:gap-6' : ''}>
        {artwork && <img src={artwork.src} alt="" loading="lazy"
          className={'discussion-thumbnail ' + (artwork.diagram ? 'discussion-thumbnail-diagram' : '')} />}
        <div className="min-w-0 space-y-2">
          <h2 className="wrap-anywhere font-bold"><Link className="hover:text-brand-700 hover:underline" to={'/discussions/' + post.id}>{post.title}</Link></h2>
          <p className="line-clamp-2 break-words text-sm text-ink-700">{body}</p>
          <p className="pt-2 text-xs text-ink-500"><AuthorLink author={post.author} /> · {dateLabel(post.createdAt)} · {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'} · {post.upvoteCount} {post.upvoteCount === 1 ? 'upvote' : 'upvotes'}</p>
        </div>
      </div>
    </article>;
  })}</div>;
}

export function AuthorLink({ author }: { author: DiscussionSummary['author'] }) {
  return <span className="inline-flex flex-wrap items-center gap-1"><Link className="font-medium hover:text-brand-700 hover:underline" to={'/people/' + author.id}>{author.name}</Link><AccountBadges role={author.role} /></span>;
}

export function DiscussionsPage() {
  const { courseId } = useParams();
  const [courseFilter, setCourseFilter] = useState('');
  const [category, setCategory] = useState('');
  const course = courseId || courseFilter;
  const query = useApiQuery(courseId ? new URLSearchParams({ courseId }).toString() : '', fetchAllDiscussions);
  const items = (query.data ?? []).filter((post) => (!course || String(post.courseId) === course)
    && (!category || readDiscussion(post.body).category === category));
  const createLink = '/discussions/new' + (course ? '?course=' + course : '');
  return <>
    {courseId ? <div className="flex justify-end"><Link className={action} to={createLink}>New discussion</Link></div> : <PageHeading title="Discussions" description="Ask a question or share what you’ve learned."><Link className={action} to={createLink}>New discussion</Link></PageHeading>}
    <div className="grid gap-3 sm:grid-cols-2">
      {!courseId && <Field label="Course"><CourseSelect all value={courseFilter} onChange={setCourseFilter} /></Field>}
      <Field label="Category"><select className={field} value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></Field>
    </div>
    {query.loading || query.error ? <Empty>{query.error ?? 'Loading discussions…'}</Empty> : courseId
      ? <DiscussionList items={items} />
      : <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DiscussionList items={items} illustrated />
        <DiscussionSidebar posts={query.data ?? []} selected={courseFilter} onSelect={setCourseFilter} />
      </div>}
  </>;
}

function DiscussionSidebar({ posts, selected, onSelect }: { posts: DiscussionSummary[]; selected: string; onSelect: (course: string) => void }) {
  const { courses } = useCommunity();
  const counts = new Map<number, number>();
  for (const { courseId } of posts) counts.set(courseId, (counts.get(courseId) ?? 0) + 1);
  const popular = courses.map((course) => ({ ...course, count: counts.get(course.id) ?? 0 }))
    .filter(({ count }) => count > 0).sort((a, b) => b.count - a.count).slice(0, 6);
  return <aside className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1" aria-label="Discussions sidebar">
    <img src={studentsPhoto} alt="Temple students outside the university" className="discussion-photo" />
    {popular.length > 0 && <Card className="space-y-4">
      <h2 className="text-lg font-bold">Popular courses</h2>
      <ul className="space-y-1">
        {popular.map((course) => <li key={course.id}>
          <Button variant="ghost" className="w-full justify-start gap-3 text-left" aria-pressed={selected === String(course.id)}
            onClick={() => onSelect(selected === String(course.id) ? '' : String(course.id))}>
            <Glyph name="discussions" className="size-5 shrink-0" />
            <span className="min-w-0">
              <strong className="block wrap-anywhere">{course.title}</strong>
              <span className="text-xs text-ink-500">{course.count} {course.count === 1 ? 'thread' : 'threads'}</span>
            </span>
          </Button>
        </li>)}
      </ul>
    </Card>}
  </aside>;
}

export function NewDiscussionPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const course = params.get('course') ?? '';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const request: CreateDiscussionRequest = {
      courseId: Number(form.get('courseId')),
      title: String(form.get('title')).trim(),
      body: discussionBody(String(form.get('body')).trim(), form.get('category') as Category),
    };
    setSaving(true);
    setError('');
    try {
      const { discussion } = await postJson<CreateDiscussionResponse>('/discussions', request);
      navigate('/discussions/' + discussion.id);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Link to={course ? '/courses/' + course : '/discussions'} className={textLink}>← Back to discussions</Link>
    <PageHeading title="New discussion" description="Give classmates enough context to understand your question." />
    <RequireAccount><Card className="max-w-2xl"><form onSubmit={submit} className="space-y-4">
      <Field label="Course"><CourseSelect defaultValue={course} /></Field>
      <Field label="Category"><select name="category" className={field}>{categories.map((name) => <option key={name}>{name}</option>)}</select></Field>
      <Field label="Title"><input name="title" className={field} required minLength={3} maxLength={200} /></Field>
      <Field label="Message"><textarea name="body" className={field} rows={6} required maxLength={9970} onChange={(event) => event.target.setCustomValidity(event.target.value.trim() ? '' : 'Enter a message.')} /></Field>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <Button type="submit" disabled={saving}>{saving ? 'Posting…' : 'Post discussion'}</Button>
    </form></Card></RequireAccount>
  </>;
}
