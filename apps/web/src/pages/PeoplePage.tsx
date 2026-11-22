import { useState } from 'react';
import { MAX_BIO_LENGTH } from '@tunion/shared';
import AccountBadges from '../components/AccountBadges';
import type { GetUserResponse, ListEnrollmentsResponse, ListUsersResponse, UpdateUserBioRequest, UpdateUserBioResponse, User } from '@tunion/shared';
import { Link, useParams } from 'react-router-dom';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Card from '../components/Card';
import { Empty, Field, PageHeading, field, textLink } from '../components/CommunityUI';
import { useCommunity } from '../demo/community';
import { api } from '../lib/api';
import { fetchContributions, readGuided } from '../lib/discussions';
import { fetchAuthorResources } from '../lib/resources';
import { useDemoAuth } from '../lib/demoAuth';
import { errorMessage, useApiQuery } from '../lib/useApiQuery';
import { DiscussionList } from './DiscussionsPage';
import { ResourceList } from './ResourcesPage';

function fetchUsers(_key: string, signal: AbortSignal) {
  return api<ListUsersResponse>('/users', { signal });
}

export function PeoplePage() {
  const { data, loading, error } = useApiQuery('', fetchUsers);
  return <>
    <PageHeading title="People" description="Meet students and peer tutors in the community." />
    {loading || error ? <Empty>{loading ? 'Loading people…' : error}</Empty> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data?.users.map((account) => <Card key={account.id} className="space-y-2">
      <AccountBadges role={account.role} tutor={account.isTutor} /><h2 className="font-bold"><Link className="hover:text-brand-700 hover:underline" to={'/people/' + account.id}>{account.name}</Link></h2>
      <p className="wrap-anywhere whitespace-pre-wrap text-sm text-ink-700">{account.bio}</p>
    </Card>)}</div>}
  </>;
}

function fetchEnrollments(id: string, signal: AbortSignal) {
  return api<ListEnrollmentsResponse>('/users/' + encodeURIComponent(id) + '/enrollments', { signal });
}

function fetchUser(id: string, signal: AbortSignal) {
  return api<GetUserResponse>('/users/' + encodeURIComponent(id), { signal });
}

export function ProfilePage() {
  const { userId = '' } = useParams();
  const profile = useApiQuery(userId, fetchUser);
  const contributions = useApiQuery(userId, fetchContributions);
  const resourceQuery = useApiQuery(userId, fetchAuthorResources);
  const enrollmentQuery = useApiQuery(userId, fetchEnrollments);
  const { courses } = useCommunity();
  const { current } = useDemoAuth();
  const person = profile.data?.user;
  if (!person) return <Empty>{profile.error ?? 'Loading profile…'}</Empty>;

  const { discussions = [], replies = [], posts } = contributions.data ?? {};
  const resources = resourceQuery.data ?? [];
  const ids = new Set([
    ...(enrollmentQuery.data?.enrollments ?? []).map((item) => item.courseId),
    ...discussions.map((item) => item.courseId),
    ...resources.map((item) => item.courseId),
    ...replies.flatMap((reply) => posts?.get(reply.discussionId)?.courseId ?? []),
  ]);
  const history = courses.filter((course) => ids.has(course.id));
  const badges = [
    discussions.length ? 'Discussion starter' : null,
    replies.length ? 'Peer supporter' : null,
    replies.some((reply) => readGuided(reply.body)) ? 'Guided Answer contributor' : null,
    resources.length ? 'Resource contributor' : null,
  ].filter(Boolean);

  return <>
    <Link to="/people" className={textLink}>← Community members</Link>
    <PageHeading title={person.name} description={[person.major, person.year ? 'Year ' + person.year : null].filter(Boolean).join(' · ') || 'Major and year not specified'}><AccountBadges role={person.role} tutor={person.isTutor} /></PageHeading>
    <Card className="space-y-3">
      <ProfileBio key={person.id} person={person} canEdit={current?.id === person.id} onSaved={profile.refresh} />
      <h2 className="font-bold">Badges</h2>
      <div className="flex flex-wrap gap-2">{badges.length ? badges.map((badge) => <Badge key={badge} tone="brand">{badge}</Badge>) : <p className="text-sm text-ink-500">No badges earned yet.</p>}</div>
    </Card>
    <section className="space-y-3"><h2 className="text-xl font-bold">Course history</h2>
      {history.length ? <div className="grid gap-3 sm:grid-cols-2">{history.map((course) => <Card key={course.id}><Link className={textLink} to={'/courses/' + course.id}>{course.code} · {course.title}</Link></Card>)}</div> : <Empty>No course activity yet.</Empty>}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Contributions</h2>
      {contributions.loading || contributions.error ? <Empty>{contributions.error ?? 'Loading discussion contributions…'}</Empty> : <>
        <h3 className="font-semibold">Discussions ({discussions.length})</h3><DiscussionList items={discussions} />
        <h3 className="font-semibold">Replies ({replies.length})</h3>
        {replies.length ? replies.map((reply) => <Card key={reply.id} className="space-y-2"><Link className={textLink} to={'/discussions/' + reply.discussionId}>{posts?.get(reply.discussionId)?.title ?? 'View discussion'}</Link><p className="line-clamp-2 break-words text-sm">{readGuided(reply.body)?.explanation ?? reply.body}</p></Card>) : <Empty>No replies yet.</Empty>}
      </>}
      <h3 className="font-semibold">Resources ({resources.length})</h3><>{resourceQuery.loading || resourceQuery.error ? <Empty>{resourceQuery.error ?? 'Loading resources…'}</Empty> : <ResourceList items={resources} />}</>
    </section>
  </>;
}

function ProfileBio({ person, canEdit, onSaved }: { person: User; canEdit: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!canEdit || draft === null) return <div className="space-y-2">
    <p className="wrap-anywhere whitespace-pre-wrap">{person.bio || 'No bio yet.'}</p>
    {canEdit && <Button variant="secondary" onClick={() => setDraft(person.bio)}>Edit Bio</Button>}
  </div>;

  return <form className="space-y-2" onSubmit={async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api<UpdateUserBioResponse>('/users/' + person.id + '/bio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: draft } satisfies UpdateUserBioRequest),
      });
      onSaved();
      setDraft(null);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }}>
    <Field label="Bio">
      <textarea className={field} rows={4} maxLength={MAX_BIO_LENGTH} value={draft} disabled={saving}
        onChange={(event) => setDraft(event.target.value)} />
    </Field>
    <p className="text-sm text-ink-500">{draft.length} / {MAX_BIO_LENGTH} characters</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex gap-2">
      <Button type="submit" disabled={saving || draft.length > MAX_BIO_LENGTH}>{saving ? 'Saving…' : 'Save'}</Button>
      <Button type="button" variant="secondary" disabled={saving} onClick={() => { setError(''); setDraft(null); }}>Cancel</Button>
    </div>
  </form>;
}
