import type { CalendarRange, ISODateString, TimeRange } from '@tunion/shared';
import { HttpError } from './http';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // Japan observes no DST, so the offset is constant.
const DAY_MS = 24 * 60 * 60 * 1000;

/** Renders a UTC instant as a JST ISO string with a "+09:00" offset. */
export function toJst(utcIso: ISODateString): ISODateString {
  return `${new Date(Date.parse(utcIso) + JST_OFFSET_MS).toISOString().slice(0, -1)}+09:00`;
}

export function timeRange(startsAt: ISODateString, endsAt: ISODateString): TimeRange {
  return { startsAt, endsAt, startsAtJst: toJst(startsAt), endsAtJst: toJst(endsAt), timeZone: 'Asia/Tokyo' };
}

export const nowIso = (): ISODateString => new Date().toISOString();

const OFFSET_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Parses an ISO instant that carries an explicit offset (no ambiguous local times) into canonical UTC form. */
export function parseInstant(value: unknown, label: string): ISODateString {
  if (typeof value !== 'string' || !OFFSET_ISO.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${label} must be an ISO-8601 timestamp with a UTC offset, e.g. 2026-11-23T14:00:00+09:00`);
  }
  return new Date(value).toISOString();
}

/** Validates a start/end pair for a future meeting of at most maxHours. */
export function parseFutureMeeting(startsRaw: unknown, endsRaw: unknown, maxHours: number): { startsAt: string; endsAt: string } {
  const startsAt = parseInstant(startsRaw, 'startsAt');
  const endsAt = parseInstant(endsRaw, 'endsAt');
  if (endsAt <= startsAt) throw new HttpError(400, 'endsAt must be after startsAt');
  if (Date.parse(endsAt) - Date.parse(startsAt) > maxHours * 60 * 60 * 1000) {
    throw new HttpError(400, `Meetings can be at most ${maxHours} hours long`);
  }
  if (startsAt <= nowIso()) throw new HttpError(400, 'startsAt must be in the future');
  return { startsAt, endsAt };
}

/** An ISO instant with offset, or YYYY-MM-DD meaning JST midnight. */
export function parseBound(value: string, label: string): ISODateString {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const ms = Date.parse(`${value}T00:00:00Z`);
    if (Number.isNaN(ms)) throw new HttpError(400, `Invalid ${label}`);
    return new Date(ms - JST_OFFSET_MS).toISOString(); // JST midnight
  }
  return parseInstant(value, label);
}

/** Resolves ?from=&to= (instants or YYYY-MM-DD in JST) with defaults [now, now+60d) and a 366-day cap. */
export function parseCalendarRange(fromRaw: unknown, toRaw: unknown): CalendarRange {
  if ((fromRaw !== undefined && typeof fromRaw !== 'string') || (toRaw !== undefined && typeof toRaw !== 'string')) {
    throw new HttpError(400, 'from/to must be strings');
  }
  const from = fromRaw ? parseBound(fromRaw as string, 'from') : nowIso();
  const to = toRaw ? parseBound(toRaw as string, 'to') : new Date(Date.parse(from) + 60 * DAY_MS).toISOString();
  if (to <= from) throw new HttpError(400, 'to must be after from');
  if (Date.parse(to) - Date.parse(from) > 366 * DAY_MS) throw new HttpError(400, 'Date range cannot exceed 366 days');
  return { from, to, fromJst: toJst(from), toJst: toJst(to), timeZone: 'Asia/Tokyo' };
}
