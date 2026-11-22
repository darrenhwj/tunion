import { LOCATION_TYPES, LOCATION_TYPE_LABELS, type LocationType, type TimeRange } from '@tunion/shared';
import { useState } from 'react';
import { newMeetingTimes } from '../lib/schedule';
import { Field, field } from './CommunityUI';

export function LocationField({ value }: { value?: LocationType }) {
  return <Field label="Location type"><select name="locationType" className={field} defaultValue={value ?? 'online'}>
    {LOCATION_TYPES.map((type) => <option key={type} value={type}>{LOCATION_TYPE_LABELS[type]}</option>)}
  </select></Field>;
}

export function MeetingTimes({ requested }: { requested?: TimeRange | null } = {}) {
  const [nextMeeting] = useState(() => newMeetingTimes());
  const startsAt = requested ? requested.startsAtJst.slice(0, -6) : nextMeeting.startsAt;
  const endsAt = requested ? requested.endsAtJst.slice(0, -6) : nextMeeting.endsAt;
  const step = requested ? 'any' : undefined;

  return <div className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
    <Field label="Starts (JST)"><input type="datetime-local" name="startsAt" defaultValue={startsAt}
      min={nextMeeting.startsAt} step={step} className={field + ' min-w-0'} required /></Field>
    <Field label="Ends (JST)"><input type="datetime-local" name="endsAt" defaultValue={endsAt}
      min={nextMeeting.startsAt} step={step} className={field + ' min-w-0'} required /></Field>
  </div>;
}
