import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GetTutorImpactResponse, ListTutorsResponse, SetTutorBadgeRequest, SetTutorBadgeResponse, TutorBadgeImpact, User } from '@tunion/shared';
import { api } from '../lib/api';
import { useDemoAuth } from '../lib/demoAuth';
import { errorMessage } from '../lib/useApiQuery';
import Button from './Button';
import Card from './Card';
import { action, textLink } from './CommunityUI';
import ConfirmDialog from './ConfirmDialog';

/** Booking / tutor-settings entry point and admin badge controls for a profile. All rules are enforced again by the API. */
export default function ProfileActions({ person, onChanged }: { person: User; onChanged: () => void }) {
  const { current } = useDemoAuth();
  if (!current) return null;
  const own = current.id === person.id;
  return <>
    {person.isTutor && <div>{own
      ? <Link to="/tutoring/availability" className={textLink}>Manage my tutor settings (subjects and availability) →</Link>
      : <BookTutoringButton person={person} />}</div>}
    {current.role === 'admin' && !own && person.role !== 'admin' && <TutorBadgeAdmin person={person} onChanged={onChanged} />}
  </>;
}

function BookTutoringButton({ person }: { person: User }) {
  const [tutorId, setTutorId] = useState<number | null | undefined>();
  useEffect(() => {
    const controller = new AbortController();
    api<ListTutorsResponse>('/tutors', { signal: controller.signal })
      .then((r) => setTutorId(r.tutors.find((tutor) => tutor.userId === person.id)?.id ?? null))
      .catch(() => { if (!controller.signal.aborted) setTutorId(null); });
    return () => controller.abort();
  }, [person.id]);
  if (tutorId === undefined) return <p className="text-sm text-ink-500" role="status">Checking tutor availability…</p>;
  if (tutorId === null) return <p className="text-sm text-ink-500">This tutor is not currently accepting requests.</p>;
  return <Link to={'/tutoring/' + tutorId + '#book'} className={action}>Book Tutoring Session</Link>;
}

function TutorBadgeAdmin({ person, onChanged }: { person: User; onChanged: () => void }) {
  const { refreshAccounts } = useDemoAuth();
  const [confirming, setConfirming] = useState(false);
  const [impact, setImpact] = useState<TutorBadgeImpact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const path = '/admin/users/' + person.id;

  async function change(isTutor: boolean) {
    setBusy(true);
    setError('');
    try {
      const result = await api<SetTutorBadgeResponse>(path + '/tutor-badge', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isTutor } satisfies SetTutorBadgeRequest),
      });
      setConfirming(false);
      setNotice(isTutor
        ? 'Tutor badge granted. They can now choose subjects and weekly availability in their tutor settings.'
        : 'Tutor badge revoked. Tutoring history was kept.' + describe(result.impact));
      refreshAccounts();
      onChanged();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function startRevoke() {
    setError('');
    setNotice('');
    setImpact(null);
    setConfirming(true);
    try {
      setImpact((await api<GetTutorImpactResponse>(path + '/tutor-impact')).impact);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return <Card className="space-y-3 border-dashed">
    <h2 className="font-bold">Admin controls</h2>
    <p className="text-sm text-ink-700">Tutor badge: <strong>{person.isTutor ? 'Active' : 'Not granted'}</strong>. Tutor is an extra capability; this account stays a Student.</p>
    {person.isTutor
      ? <Button variant="secondary" disabled={busy} onClick={() => void startRevoke()}>Revoke Tutor badge</Button>
      : <Button disabled={busy} onClick={() => void change(true)}>{busy ? 'Granting…' : 'Grant Tutor badge'}</Button>}
    {notice && <p role="status" className="whitespace-pre-line text-sm text-brand-700">{notice}</p>}
    {!confirming && error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <ConfirmDialog open={confirming} title={'Revoke ' + person.name + '’s Tutor badge?'} confirmLabel="Revoke badge" busy={busy} error={error}
      onConfirm={() => void change(false)} onCancel={() => setConfirming(false)}>
      <p>They will disappear from the tutor directory and no new tutoring requests can be sent to them. Completed tutoring history is kept.</p>
      {impact === null ? <p role="status">Checking outstanding requests and sessions…</p>
        : !impact.openRequests.length && !impact.upcomingSessions.length ? <p>No open requests or upcoming sessions need attention.</p>
        : <div className="rounded-lg bg-canvas p-3"><p className="font-semibold">Needs attention (nothing is cancelled automatically):</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {impact.openRequests.map((item) => <li key={'r' + item.id}>{item.status} request from {item.studentName} · {item.courseCode}</li>)}
            {impact.upcomingSessions.map((item) => <li key={'s' + item.id}>Session with {item.studentName} · {item.courseCode} · {new Date(item.startsAt).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })} JST</li>)}
          </ul></div>}
    </ConfirmDialog>
  </Card>;
}

function describe(impact: TutorBadgeImpact) {
  const parts = [
    impact.openRequests.length ? impact.openRequests.length + ' open request(s)' : '',
    impact.upcomingSessions.length ? impact.upcomingSessions.length + ' upcoming session(s)' : '',
  ].filter(Boolean);
  return parts.length ? '\nStill needs follow-up: ' + parts.join(' and ') + '.' : '';
}
