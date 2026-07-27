import { moment } from "obsidian";
import type { VEvent } from 'node-ical';
import { IEvent } from './IEvent';

// The date/time half of IEvent. Kept out of main.ts so it can be exercised
// without standing up an Obsidian Plugin instance.
export type EventDateFields = Pick<IEvent,
  'utime' | 'endUtime' | 'time' | 'endTime' | 'startDateTime' | 'endDateTime' | 'allDay'>;

// Only the three properties the date fields are derived from - callers (and
// tests) shouldn't need to fabricate an entire VEvent.
export type EventDateSource = Pick<VEvent, 'start' | 'end' | 'datetype'>;

// node-ical hands us a resolved start/end: the timezone is applied, a DURATION
// is expanded into an end, and an absent DTEND/DURATION falls back to the RFC
// 5545 default (one day for VALUE=DATE, zero length otherwise). So there's no
// DTEND/DURATION branching to do here.
export function eventDateFields(e: EventDateSource, timeFormat: string): EventDateFields {
  const start = moment(e.start);
  const end = moment(e.end);

  return {
    utime: start.format('X'),
    endUtime: end.format('X'),
    time: start.format(timeFormat),
    endTime: end.format(timeFormat),
    // Full ISO 8601 with offset, so multi-day events are expressible - time and
    // endTime are clock times only.
    startDateTime: start.format(),
    endDateTime: end.format(),
    // DTEND is exclusive for all-day events, so an event running through Sep 14
    // has an endDateTime of Sep 15 00:00.
    allDay: e.datetype === 'date',
  };
}
