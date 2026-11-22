import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudyGroupCalendarResponse, TimeRange, TutoringCalendarResponse } from '@tunion/shared';
import Badge from './Badge';
import Button from './Button';
import Card from './Card';
import { textLink } from './CommunityUI';
import Glyph from './Glyph';
import { api } from '../lib/api';
import { dateTimeJst, locationLabel, monthStart, timeLabel, todayJst, weekdays } from '../lib/schedule';
import { useApiQuery } from '../lib/useApiQuery';
import { PendingTutoringRequests } from '../pages/TutoringActivity';

const eventKinds = {
  providing: { label: 'Providing tutoring', dot: 'bg-purple-600' },
  receiving: { label: 'Receiving tutoring', dot: 'bg-blue-600' },
  study: { label: 'Study group', dot: 'bg-green-600' },
} as const;
type EventKind = keyof typeof eventKinds;
type CalendarEvent = TimeRange & { id: number; title: string; course: string; location: string; url: string; status: string; kind: EventKind };

async function loadCalendar(key: string, signal: AbortSignal): Promise<CalendarEvent[]> {
  const [month, accountId] = key.split(':');
  const viewer = Number(accountId);
  const params = new URLSearchParams({ from: monthStart(month, 0), to: monthStart(month, 1) });
  const [tutoring, joined, discover] = await Promise.all([
    api<TutoringCalendarResponse>('/calendar/tutoring?' + params, { signal }),
    api<StudyGroupCalendarResponse>('/calendar/study-groups?' + params + '&scope=mine', { signal }),
    api<StudyGroupCalendarResponse>('/calendar/study-groups?' + params + '&scope=discover', { signal }),
  ]);
  const events: CalendarEvent[] = tutoring.sessions
    .filter((session) => session.tutor.id === viewer || session.student.id === viewer)
    .map((session) => ({
      ...session, title: 'Tutoring · ' + session.courseTitle, course: session.courseCode,
      location: locationLabel(session), url: '/tutoring/sessions/' + session.id,
      kind: session.tutor.id === viewer ? 'providing' : 'receiving',
    }));
  for (const session of [...joined.sessions, ...discover.sessions]) {
    events.push({
      ...session, title: session.title, course: session.courseCode, kind: 'study',
      url: '/groups/' + session.groupId + '#session-' + session.id,
    });
  }
  for (const session of [...joined.oneTimeSessions, ...discover.oneTimeSessions]) {
    events.push({
      ...session, course: session.courseCode, kind: 'study', url: '/groups/one-time/' + session.id,
    });
  }
  return events;
}

export default function DashboardCalendar({ accountId, canTutor }: { accountId: number; canTutor: boolean }) {
  const today = todayJst();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const rightPanel = useRef<HTMLDivElement>(null);
  const agenda = useRef<HTMLDivElement>(null);
  const query = useApiQuery(month + ':' + accountId, loadCalendar);
  const start = monthStart(month, 0);
  const first = new Date(start + 'T00:00:00Z');
  const dayCount = new Date(Date.parse(monthStart(month, 1)) - 86400000).getUTCDate();
  const days = Array.from({ length: dayCount }, (_, index) => start.slice(0, 8) + String(index + 1).padStart(2, '0'));
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);

  const monthEvents = (query.data ?? []).filter((event) => canTutor || event.kind !== 'providing')
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));

  function eventsOn(date: string) {
    const end = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
    const from = Date.parse(dateTimeJst(date + 'T00:00'));
    const to = Date.parse(dateTimeJst(end + 'T00:00'));
    return monthEvents.filter((event) => Date.parse(event.startsAt) < to && Date.parse(event.endsAt) > from);
  }

  function move(offset: number) {
    setMonth(monthStart(month, offset).slice(0, 7));
    setDay(null);
  }

  function selectDay(date: string | null) {
    setDay(date);
    if (rightPanel.current && agenda.current) rightPanel.current.scrollTop = agenda.current.offsetTop;
  }

  const events = day ? eventsOn(day) : monthEvents;
  // Keep the former 22rem agenda and its heading as the desktop height floor.
  // Longer calendar months can still size the row exactly as before.
  const rightPanelHeight = day ? 'min-h-[25rem]' : 'min-h-[24.25rem]';
  return <section aria-labelledby="calendar-heading" className="space-y-3">
    <h1 id="calendar-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Glyph name="calendar" className="size-6 text-brand-700" /> Calendar</h1>
    <Card className="space-y-5 px-3 sm:px-5">
      <ul aria-label="Calendar legend" className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-ink-700 sm:text-sm">
        {Object.entries(eventKinds).filter(([kind]) => canTutor || kind !== 'providing').map(([, { label, dot }]) => <li key={label} className="flex items-center gap-2"><span aria-hidden="true" className={'size-2 rounded-full ' + dot} />{label}</li>)}
      </ul>
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">{monthLabel} <span className="text-xs font-medium text-ink-500">JST</span></h3>
            <div className="flex items-center gap-1">
              <Button variant="ghost" aria-label="Previous month" onClick={() => move(-1)}><Glyph name="arrowLeft" className="size-4" /></Button>
              <Button variant="ghost" onClick={() => { setMonth(today.slice(0, 7)); selectDay(today); }}>Today</Button>
              <Button variant="ghost" aria-label="Next month" onClick={() => move(1)}><Glyph name="arrow" className="size-4" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((name) => <span key={name} className="py-1 text-xs font-medium text-ink-500" title={name}>{name.slice(0, 2)}</span>)}
            {Array.from({ length: first.getUTCDay() }, (_, index) => <span key={'blank-' + index} />)}
            {days.map((date, index) => {
              const kinds = [...new Set(eventsOn(date).map((event) => event.kind))];
              return <button key={date} type="button" aria-label={date + (kinds.length ? ', ' + kinds.map((kind) => eventKinds[kind].label).join(', ') : '')}
                aria-current={date === today ? 'date' : undefined} aria-pressed={day === date}
                className={'flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md text-sm hover:bg-brand-50 hover:text-brand-700 sm:min-h-14 ' + (day === date ? 'bg-brand-100 font-semibold text-brand-700 ring-1 ring-brand-500' : date === today ? 'bg-brand-50 font-semibold text-brand-700' : 'bg-canvas')}
                onClick={() => selectDay(day === date ? null : date)}>{index + 1}{kinds.length > 0 && <span aria-hidden="true" className="flex gap-0.5">{kinds.map((kind) => <span key={kind} className={'size-1.5 rounded-full sm:size-2 ' + eventKinds[kind].dot} />)}</span>}</button>;
            })}
          </div>
        </div>
        <div className={'relative min-w-0 ' + rightPanelHeight}>
          <div ref={rightPanel} role="region" aria-label="Calendar agenda and tutoring requests" tabIndex={0}
            className="relative max-h-[26rem] space-y-5 overflow-y-auto pr-2 xl:absolute xl:inset-0 xl:max-h-none xl:overscroll-contain">
            <PendingTutoringRequests userId={accountId} canTutor={canTutor} onChange={query.refresh} />
            <div ref={agenda} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="calendar-agenda-heading" className="font-semibold">{day ?? 'Month agenda'}</h3>
                {day && <Button variant="ghost" onClick={() => setDay(null)}>Show full month</Button>}
              </div>
              <div key={month + (day ?? '')} role="region" aria-labelledby="calendar-agenda-heading" aria-live="polite" className="space-y-2">
                {query.loading ? <p className="text-sm text-ink-500">Loading sessions…</p>
                  : query.error ? <p role="alert" className="text-sm text-red-300">{query.error} <button type="button" className={textLink} onClick={query.refresh}>Retry</button></p>
                  : events.length ? events.map((event) => <div key={event.url} className="space-y-1 rounded-lg border border-line p-3">
                    <div className="flex flex-wrap gap-2"><Badge tone="brand">{event.course}</Badge><Badge>{eventKinds[event.kind].label}</Badge>{event.status === 'completed' && <Badge>Completed</Badge>}</div>
                    <Link to={event.url} className={textLink + ' line-clamp-1 break-words'}>{event.title}</Link>
                    <p className="text-xs text-ink-700">{timeLabel(event)}</p>
                    <p className="truncate text-xs text-ink-500">{event.location}</p>
                  </div>) : <p className="text-sm text-ink-500">No sessions for this date range.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  </section>;
}
