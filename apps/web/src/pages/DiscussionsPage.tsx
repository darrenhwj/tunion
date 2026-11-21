import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { CreateDiscussionRequest, CreateDiscussionResponse, DiscussionSummary } from '@tunion/shared';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import { CourseSelect, Empty, Field, PageHeading, RequireAccount, action, dateLabel, field, textLink } from '../components/CommunityUI';
import { useCommunity } from '../demo/community';
import { postJson } from '../lib/api';
import { categories, discussionBody, fetchAllDiscussions, readDiscussion, type Category } from '../lib/discussions';
import { errorMessage, useApiQuery } from '../lib/useApiQuery';

export function DiscussionList({ items }: { items: DiscussionSummary[] }) {
  const { courses } = useCommunity();
  if (!items.length) return <Empty>No discussions found.</Empty>;
  return <div className="space-y-3">{items.map((post) => {
    const course = courses.find((item) => item.id === post.courseId);
    const { category, body } = readDiscussion(post.body);
    return <Card key={post.id} className="space-y-2">
      <div className="flex flex-wrap gap-2"><Badge tone="brand">{category}</Badge>{course && <Badge>{course.code}</Badge>}{post.isResolved && <Badge>Resolved</Badge>}</div>
      <h2 className="font-bold"><Link className="hover:text-brand-700 hover:underline" to={'/discussions/' + post.id}>{post.title}</Link></h2>
      <p className="line-clamp-2 break-words text-sm text-ink-700">{body}</p>
      <p className="text-xs text-ink-500"><AuthorLink author={post.author} /> · {dateLabel(post.createdAt)} · {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'} · {post.upvoteCount} {post.upvoteCount === 1 ? 'upvote' : 'upvotes'}</p>
    </Card>;
  })}</div>;
}

export function AuthorLink({ author }: { author: DiscussionSummary['author'] }) {
  return <Link className="font-medium hover:text-brand-700 hover:underline" to={'/people/' + author.id}>{author.name}</Link>;
}

export function DiscussionsPage() {
  const { courseId } = useParams();
  const [courseFilter, setCourseFilter] = useState('');
  const [category, setCategory] = useState('');
  const course = courseId || courseFilter;
  const query = useApiQuery(course ? new URLSearchParams({ courseId: course }).toString() : '', fetchAllDiscussions);
  const items = (query.data ?? []).filter((post) => !category || readDiscussion(post.body).category === category);
  const createLink = '/discussions/new' + (course ? '?course=' + course : '');
  return <>
    {courseId ? <div className="flex justify-end"><Link className={action} to={createLink}>New discussion</Link></div> : <PageHeading title="Discussions" description="Ask a question or share what you’ve learned."><Link className={action} to={createLink}>New discussion</Link></PageHeading>}
    <div className="grid gap-3 sm:grid-cols-2">
      {!courseId && <Field label="Course"><CourseSelect all value={courseFilter} onChange={setCourseFilter} /></Field>}
      <Field label="Category"><select className={field} value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></Field>
    </div>
    {query.loading || query.error ? <Empty>{query.error ?? 'Loading discussions…'}</Empty> : <DiscussionList items={items} />}
  </>;
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
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={saving}>{saving ? 'Posting…' : 'Post discussion'}</Button>
    </form></Card></RequireAccount>
  </>;
}
