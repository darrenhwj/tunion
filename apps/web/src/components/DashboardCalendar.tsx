import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudyGroupCalendarResponse, TimeRange, TutoringCalendarResponse } from '@tunion/shared';
import Badge from './Badge';
import Button from './Button';
import Card from './Card';
import { Empty, textLink } from './CommunityUI';
import Glyph from './Glyph';
import { api } from '../lib/api';
import { dateTimeJst, locationLabel, monthStart, timeLabel, todayJst, weekdays } from '../lib/schedule';
import { useApiQuery } from '../lib/useApiQuery';
import { useDemoAuth } from '../lib/demoAuth';

type CalendarView = 'tutoring' | 'mine' | 'discover';
type CalendarEvent = TimeRange & { id: number; title: string; course: string; location: string; url: string; status: string };

async function loadCalendar(key: string, signal: AbortSignal): Promise<CalendarEvent[]> {
  const [view, month] = key.split(':');
  const params = new URLSearchParams({ from: monthStart(month, 0), to: monthStart(month, 1) });
  if (view === 'tutoring') {
    const { sessions } = await api<TutoringCalendarResponse>('/calendar/tutoring?' + params, { signal });
    return sessions.map((session) => ({
      ...session, title: 'Tutoring · ' + session.courseTitle, course: session.courseCode,
      location: locationLabel(session), url: '/tutoring/sessions/' + session.id,
    }));
  }
  params.set('scope', view);
  const { sessions } = await api<StudyGroupCalendarResponse>('/calendar/study-groups?' + params, { signal });
  return sessions.map((session) => ({
    ...session, title: session.title, course: session.courseCode, url: '/groups/' + session.groupId + '#session-' + session.id,
  }));
}

const views: { key: CalendarView; label: string }[] = [
  { key: 'tutoring', label: 'Tutoring' }, { key: 'mine', label: 'My study groups' }, { key: 'discover', label: 'Discover study groups' },
];

export default function DashboardCalendar() {
  const { current, loading } = useDemoAuth();
  return <section aria-labelledby="calendar-heading" className="space-y-3">
    <h2 id="calendar-heading" className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Glyph name="calendar" className="size-6 text-brand-700" /> Calendar</h2>
    {current ? <Calendar key={current.id} /> : <Empty>{loading ? 'Loading calendar…' : 'Select a demo account to see your calendar.'}</Empty>}
  </section>;
}

function Calendar() {
  const today = todayJst();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const [view, setView] = useState<CalendarView>('tutoring');
  const query = useApiQuery(view + ':' + month, loadCalendar);
  const start = monthStart(month, 0);
  const first = new Date(start + 'T00:00:00Z');
  const dayCount = new Date(Date.parse(monthStart(month, 1)) - 86400000).getUTCDate();
  const days = Array.from({ length: dayCount }, (_, index) => start.slice(0, 8) + String(index + 1).padStart(2, '0'));
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);

  function eventsOn(date: string) {
    const end = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
    const from = Date.parse(dateTimeJst(date + 'T00:00'));
    const to = Date.parse(dateTimeJst(end + 'T00:00'));
    return (query.data ?? []).filter((event) => Date.parse(event.startsAt) < to && Date.parse(event.endsAt) > from);
  }

  function move(offset: number) {
    setMonth(monthStart(month, offset).slice(0, 7));
    setDay(null);
  }

  const events = day ? eventsOn(day) : query.data ?? [];
  return <Card className="space-y-5">
    <div aria-label="Calendar view" role="group" className="flex flex-wrap gap-2">
      {views.map((option) => <Button key={option.key} variant={view === option.key ? 'primary' : 'secondary'} aria-pressed={view === option.key} onClick={() => { setView(option.key); setDay(null); }}>{option.label}</Button>)}
    </div>
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">{monthLabel} <span className="text-xs font-medium text-ink-500">JST</span></h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" aria-label="Previous month" onClick={() => move(-1)}>←</Button>
            <Button variant="ghost" onClick={() => { setMonth(today.slice(0, 7)); setDay(today); }}>Today</Button>
            <Button variant="ghost" aria-label="Next month" onClick={() => move(1)}>→</Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdays.map((name) => <span key={name} className="py-1 text-xs font-medium text-ink-500" title={name}>{name.slice(0, 2)}</span>)}
          {Array.from({ length: first.getUTCDay() }, (_, index) => <span key={'blank-' + index} />)}
          {days.map((date, index) => {
            const count = eventsOn(date).length;
            return <button key={date} type="button" aria-label={date + (count ? ', ' + count + (count === 1 ? ' session' : ' sessions') : '')}
              aria-current={date === today ? 'date' : undefined} aria-pressed={day === date}
              className={'relative min-h-9 rounded-md pb-1 text-sm hover:bg-brand-50 hover:text-brand-700 ' + (day === date ? 'bg-brand-600 font-semibold text-white' : date === today ? 'bg-brand-50 font-semibold text-brand-700' : 'bg-canvas')}
              onClick={() => setDay(day === date ? null : date)}>{index + 1}{count > 0 && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 text-[10px] leading-3">•</span>}</button>;
          })}
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{day ?? 'Month agenda'}</h3>
          {day && <Button variant="ghost" onClick={() => setDay(null)}>Show full month</Button>}
        </div>
        <div aria-live="polite" className="space-y-2">
          {query.loading ? <p className="text-sm text-ink-500">Loading sessions…</p>
            : query.error ? <p role="alert" className="text-sm text-red-700">{query.error} <button type="button" className={textLink} onClick={query.refresh}>Retry</button></p>
            : events.length ? events.map((event) => <div key={event.id} className="space-y-1 rounded-lg border border-line p-3">
              <div className="flex flex-wrap gap-2"><Badge tone="brand">{event.course}</Badge>{event.status === 'completed' && <Badge>Completed</Badge>}</div>
              <Link to={event.url} className={textLink}>{event.title}</Link>
              <p className="text-xs text-ink-700">{timeLabel(event)}</p>
              <p className="break-words text-xs text-ink-500">{event.location}</p>
            </div>) : <p className="text-sm text-ink-500">No sessions in this view.</p>}
        </div>
      </div>
    </div>
  </Card>;
}
