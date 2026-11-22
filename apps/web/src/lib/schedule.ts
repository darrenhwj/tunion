import { APP_TIME_ZONE, LOCATION_TYPE_LABELS, type MeetingDetails, type TimeRange } from '@tunion/shared';

export const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function todayJst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: APP_TIME_ZONE }).format(new Date());
}

export function newMeetingTimes(durationMinutes = 60) {
  const start = Math.floor(Date.now() / 60_000) * 60_000 + 60_000;
  const format = (instant: number) => new Intl.DateTimeFormat('sv-SE', {
    timeZone: APP_TIME_ZONE, dateStyle: 'short', timeStyle: 'short',
  }).format(instant).replace(' ', 'T');
  return { startsAt: format(start), endsAt: format(start + durationMinutes * 60_000) };
}

export function monthStart(month: string, offset: number) {
  const date = new Date(month + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

export function dateTimeJst(value: string) {
  return value + ':00+09:00';
}

export function timeLabel(range: TimeRange) {
  const start = range.startsAtJst.slice(0, 16).replace('T', ' ');
  const end = range.endsAtJst.slice(0, 16).replace('T', ' ');
  return start + ' – ' + (start.slice(0, 10) === end.slice(0, 10) ? end.slice(11) : end) + ' JST';
}

export function locationLabel(meeting: MeetingDetails) {
  return [LOCATION_TYPE_LABELS[meeting.locationType], meeting.locationDetails].filter(Boolean).join(' · ');
}
