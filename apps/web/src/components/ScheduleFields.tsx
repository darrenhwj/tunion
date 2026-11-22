import { LOCATION_TYPES, LOCATION_TYPE_LABELS, type LocationType } from '@tunion/shared';
import { useState } from 'react';
import { newMeetingTimes } from '../lib/schedule';
import { Field, field } from './CommunityUI';

export function LocationField({ value }: { value?: LocationType }) {
  return <Field label="Location type"><select name="locationType" className={field} defaultValue={value ?? 'online'}>
    {LOCATION_TYPES.map((type) => <option key={type} value={type}>{LOCATION_TYPE_LABELS[type]}</option>)}
  </select></Field>;
}

export function MeetingTimes({ durationMinutes }: { durationMinutes?: number } = {}) {
  const [initial] = useState(() => newMeetingTimes(durationMinutes));
  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Starts (JST)"><input type="datetime-local" name="startsAt" defaultValue={initial.startsAt} min={initial.startsAt} className={field} required /></Field>
    <Field label="Ends (JST)"><input type="datetime-local" name="endsAt" defaultValue={initial.endsAt} min={initial.startsAt} className={field} required /></Field>
  </div>;
}
