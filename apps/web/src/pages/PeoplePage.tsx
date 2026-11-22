import AccountBadges from '../components/AccountBadges';
import type { GetUserResponse, ListUsersResponse } from '@tunion/shared';
import { Link, useParams } from 'react-router-dom';
import Badge from '../components/Badge';
import Card from '../components/Card';
import { Empty, PageHeading, textLink } from '../components/CommunityUI';
import { useCommunity } from '../demo/community';
import { api } from '../lib/api';
import { fetchContributions, readGuided } from '../lib/discussions';
import { useApiQuery } from '../lib/useApiQuery';
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
      <AccountBadges role={account.role} /><h2 className="font-bold"><Link className="hover:text-brand-700 hover:underline" to={'/people/' + account.id}>{account.name}</Link></h2>
      <p className="text-sm text-ink-700">{account.bio}</p>
    </Card>)}</div>}
  </>;
}

function fetchUser(id: string, signal: AbortSignal) {
  return api<GetUserResponse>('/users/' + encodeURIComponent(id), { signal });
}

export function ProfilePage() {
  const { userId = '' } = useParams();
  const profile = useApiQuery(userId, fetchUser);
  const contributions = useApiQuery(userId, fetchContributions);
  const { courses, data } = useCommunity();
  const person = profile.data?.user;
  if (!person) return <Empty>{profile.error ?? 'Loading profile…'}</Empty>;

  const { discussions = [], replies = [], posts } = contributions.data ?? {};
  const resources = data.resources.filter((item) => item.authorId === person.id);
  const ids = new Set([
    ...(data.enrollments[person.id] ?? []),
    ...(data.pastCourses?.[person.id] ?? []),
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
    <PageHeading title={person.name} description={person.major + ' · Year ' + person.year}><AccountBadges role={person.role} /></PageHeading>
    <Card className="space-y-3"><p>{person.bio || 'No bio yet.'}</p><h2 className="font-bold">Badges</h2><div className="flex flex-wrap gap-2">{badges.length ? badges.map((badge) => <Badge key={badge} tone="brand">{badge}</Badge>) : <p className="text-sm text-ink-500">No badges earned yet.</p>}</div></Card>
    <section className="space-y-3"><h2 className="text-xl font-bold">Course history</h2>
      {history.length ? <div className="grid gap-3 sm:grid-cols-2">{history.map((course) => <Card key={course.id}><Link className={textLink} to={'/courses/' + course.id}>{course.code} · {course.title}</Link></Card>)}</div> : <Empty>No course activity yet.</Empty>}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-bold">Contributions</h2>
      {contributions.loading || contributions.error ? <Empty>{contributions.error ?? 'Loading discussion contributions…'}</Empty> : <>
        <h3 className="font-semibold">Discussions ({discussions.length})</h3><DiscussionList items={discussions} />
        <h3 className="font-semibold">Replies ({replies.length})</h3>
        {replies.length ? replies.map((reply) => <Card key={reply.id} className="space-y-2"><Link className={textLink} to={'/discussions/' + reply.discussionId}>{posts?.get(reply.discussionId)?.title ?? 'View discussion'}</Link><p className="line-clamp-2 break-words text-sm">{readGuided(reply.body)?.explanation ?? reply.body}</p></Card>) : <Empty>No replies yet.</Empty>}
      </>}
      <h3 className="font-semibold">Resources ({resources.length})</h3><ResourceList items={resources} />
    </section>
  </>;
}
