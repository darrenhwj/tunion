import { LOCATION_TYPES, LOCATION_TYPE_LABELS, type LocationType } from '@tunion/shared';
import { Field, field } from './CommunityUI';

export function LocationField({ value }: { value?: LocationType }) {
  return <Field label="Location type"><select name="locationType" className={field} defaultValue={value ?? 'online'}>
    {LOCATION_TYPES.map((type) => <option key={type} value={type}>{LOCATION_TYPE_LABELS[type]}</option>)}
  </select></Field>;
}

export function MeetingTimes() {
  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Starts (JST)"><input type="datetime-local" name="startsAt" className={field} required /></Field>
    <Field label="Ends (JST)"><input type="datetime-local" name="endsAt" className={field} required /></Field>
  </div>;
}
