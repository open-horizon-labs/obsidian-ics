import * as ical from 'node-ical';
import type { VEvent } from 'node-ical';
import { tz } from 'moment-timezone';
import { moment } from 'obsidian';

import type { ProcessedEvent } from './icalUtils';
import { textValue } from './icsText';

// Occurrence selection, in three stages:
//
//   expandOccurrences()  a VEVENT -> the concrete occurrences it produces
//   occurrenceDays()     an occurrence -> the calendar days it appears on
//   selectOccurrences()  occurrences whose days intersect the requested days
//
// Previously each event kind (one-off, RRULE occurrence, recurrence override,
// ongoing multi-day event) matched days in its own way, with its own notion of
// which timezone defines "the day". Those four notions disagreed, and most of
// the bugs in this area were the disagreement rather than any single branch
// being wrong. Materialising an occurrence first means day matching happens
// once, in one place, for every kind.
//
// Two temporal models, deliberately kept apart (RFC 5545 §3.3.4/§3.3.5):
//
//   VALUE=DATE  is a floating calendar date. "3 August" is 3 August for every
//               reader; its label must not move with the host timezone. These
//               are anchored at local midnight and compared by their date
//               label. DTEND is exclusive.
//   DATE-TIME   is an instant. Which day it belongs to is a question about the
//               reader, and the answer this plugin has always given (for
//               one-off and ongoing events, and for the daily note the query
//               comes from) is the host's local day.

export type OccurrenceKind = 'one-off' | 'recurring' | 'recurring override';

export interface Occurrence {
  /** The VEVENT supplying this occurrence's data: the master, or its override. */
  source: ProcessedEvent;
  start: Date;
  end: Date;
  /** True when this came from VALUE=DATE (a floating calendar date). */
  allDay: boolean;
  kind: OccurrenceKind;
  recurrent: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isCancelled(event: Pick<VEvent, 'status'>): boolean {
  return typeof event.status === 'string' && event.status.toUpperCase() === 'CANCELLED';
}

function isFullDayEvent(event: ProcessedEvent): boolean {
  return event.datetype === 'date' || Boolean((event.start as { dateOnly?: boolean })?.dateOnly);
}

/** The calendar-date label of a Date, read in host-local terms. */
function dateLabel(date: Date): string {
  return moment(date).format('YYYY-MM-DD');
}

/**
 * A Date at local midnight on the same calendar date the input names. Used to
 * anchor VALUE=DATE values so their label is stable in every host timezone.
 */
function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/**
 * The timezone a value was declared in, if it named one. node-ical attaches the
 * TZID to the parsed Date; a floating or UTC value has none, and is read in
 * host-local terms, which is how it was parsed in the first place.
 */
function declaredZone(value: Date): string | undefined {
  return (value as { tz?: string }).tz;
}

function inDeclaredZone(value: Date, tzid: string | undefined): moment.Moment {
  return tzid ? tz(value, tzid) : moment(value);
}

/**
 * Recognise an all-day range that an exporter re-encoded as a timed one.
 *
 * Some providers re-publish `DTSTART;VALUE=DATE:20260803 / DTEND;VALUE=DATE:20260915`
 * as `DTSTART;TZID=Europe/Berlin:20260803T000000 / DTEND;TZID=Europe/Berlin:20260914T235959`.
 * Read literally that is a pair of instants, so the event loses its all-day
 * flag, ends a second before midnight instead of at the exclusive next
 * midnight, and - being instant-attributed - slides onto neighbouring dates for
 * hosts far from the declared zone. A six-week school holiday then shows up on
 * the wrong days, which is what was reported.
 *
 * The test is deliberately exact: midnight to 23:59:59.000 *in the event's own
 * declared timezone*. A real meeting from 00:00 to 23:59:59 is indistinguishable
 * from this and is vanishingly rare; a real meeting one second either side of
 * those bounds is common enough that widening the test would start reclassifying
 * genuine timed events. Reading the clock in the declared zone (rather than
 * measuring elapsed time) is also what makes a span crossing a DST change work:
 * such a span is not a whole number of hours, but its wall-clock endpoints are
 * still midnight and end-of-day.
 */
/** How many inclusive calendar days a pair of YYYY-MM-DD labels spans. */
function inclusiveDaySpan(firstLabel: string, lastLabel: string): number {
  const asUtcDay = (label: string): number =>
    Date.UTC(Number(label.slice(0, 4)), Number(label.slice(5, 7)) - 1, Number(label.slice(8, 10)));

  return Math.round((asUtcDay(lastLabel) - asUtcDay(firstLabel)) / MS_PER_DAY) + 1;
}

/** The recognised shape, described in whole calendar days rather than elapsed time. */
interface ReexportedAllDayShape {
  /** Inclusive calendar days the source range covers. */
  days: number;
  /** The timezone both endpoints declared (undefined when both are floating). */
  zone: string | undefined;
}

/**
 * Recognise, on the *source* VEVENT, an all-day range that an exporter
 * re-encoded as a timed one: exactly 00:00:00.000 to 23:59:59.000, both
 * endpoints declared in the same timezone.
 *
 * The test is deliberately exact. A real meeting one second either side of
 * those bounds is common enough that widening it would start reclassifying
 * genuine timed events, and a next-midnight end is a legitimate 24-hour or
 * on-call shift rather than this shape.
 *
 * Requiring one zone matters: read in the start's zone alone, an event that
 * genuinely ends at 22:59:59 in London looks like end-of-day in Berlin.
 *
 * What comes back is a day *count*, not a pair of instants, because that is the
 * part that survives recurrence. node-ical expands a series by preserving
 * elapsed duration, so an occurrence on the far side of a DST change keeps the
 * source's elapsed length and lands at 00:59:59 rather than 23:59:59. Its
 * calendar-day span is unchanged, so that is what gets projected.
 */
function reexportedAllDayShape(source: ProcessedEvent): ReexportedAllDayShape | null {
  if (!source.start || !source.end) {
    return null;
  }

  const startZone = declaredZone(source.start);
  const endZone = declaredZone(source.end);
  if (startZone !== endZone) {
    return null;
  }

  const zonedStart = inDeclaredZone(source.start, startZone);
  const zonedEnd = inDeclaredZone(source.end, endZone);

  const startsAtMidnight = zonedStart.hours() === 0
    && zonedStart.minutes() === 0
    && zonedStart.seconds() === 0
    && zonedStart.milliseconds() === 0;
  const endsAtLastSecond = zonedEnd.hours() === 23
    && zonedEnd.minutes() === 59
    && zonedEnd.seconds() === 59
    && zonedEnd.milliseconds() === 0;

  if (!startsAtMidnight || !endsAtLastSecond) {
    return null;
  }

  const days = inclusiveDaySpan(zonedStart.format('YYYY-MM-DD'), zonedEnd.format('YYYY-MM-DD'));
  return days >= 1 ? { days, zone: startZone } : null;
}

/**
 * Re-anchor one occurrence of a recognised shape onto floating calendar dates,
 * with the exclusive DTEND all-day events use here.
 *
 * The occurrence's own start still has to be exact midnight in the declared
 * zone - that is what says this instance really is the start of a day - but its
 * end is ignored, having been derived from elapsed duration upstream.
 */
function projectAllDayOccurrence(
  shape: ReexportedAllDayShape,
  start: Date,
): { start: Date; end: Date } | null {
  const zonedStart = inDeclaredZone(start, shape.zone);
  const startsAtMidnight = zonedStart.hours() === 0
    && zonedStart.minutes() === 0
    && zonedStart.seconds() === 0
    && zonedStart.milliseconds() === 0;

  if (!startsAtMidnight) {
    return null;
  }

  const firstDay = moment(zonedStart.format('YYYY-MM-DD'), 'YYYY-MM-DD').startOf('day');
  return {
    start: firstDay.toDate(),
    end: firstDay.clone().add(shape.days, 'day').startOf('day').toDate(),
  };
}

function toOccurrence(
  source: ProcessedEvent,
  start: Date,
  end: Date,
  allDay: boolean,
  kind: OccurrenceKind,
): Occurrence {
  const recurrent = kind !== 'one-off';

  if (!allDay) {
    // Recognised on the source VEVENT - the master for an RRULE or RDATE
    // occurrence, the override's own VEVENT for an override - then projected
    // onto this occurrence's start.
    const shape = reexportedAllDayShape(source);
    const projected = shape && projectAllDayOccurrence(shape, start);
    if (projected) {
      return { source, start: projected.start, end: projected.end, allDay: true, kind, recurrent };
    }
  }

  return { source, start, end, allDay, kind, recurrent };
}

/**
 * Distinct override VEVENTs for an event. node-ical keys `recurrences` by both
 * a date-only and a full-ISO key for the same override, so the same object
 * appears twice; a Set over the values collapses that.
 */
function overridesOf(event: ProcessedEvent): ProcessedEvent[] {
  if (!event.recurrences) {
    return [];
  }

  return [...new Set(Object.values(event.recurrences) as ProcessedEvent[])];
}

function recurrenceIdOf(event: ProcessedEvent): number | undefined {
  return event.recurrenceid instanceof Date ? event.recurrenceid.getTime() : undefined;
}

// RDATE is parsed by node-ical but never expanded - it arrives as the raw
// property value, so without this the extra occurrences it names are silently
// missing. RFC 5545 allows DATE, DATE-TIME and PERIOD values; PERIOD is not
// handled here (it would need its own start/end pair rather than reusing the
// event's duration) and is skipped rather than guessed at.
type RawProperty = string | { val?: string; params?: Record<string, string | undefined> };

function rdateEntries(event: ProcessedEvent): { value: string; tzid?: string }[] {
  const raw = (event as unknown as { rdate?: RawProperty | RawProperty[] }).rdate;
  if (!raw) {
    return [];
  }

  const properties = Array.isArray(raw) ? raw : [raw];
  const entries: { value: string; tzid?: string }[] = [];

  for (const property of properties) {
    const text = typeof property === 'string' ? property : property?.val;
    if (!text) {
      continue;
    }

    const params = typeof property === 'string' ? undefined : property.params;
    const tzid = params?.TZID;
    if (params?.VALUE?.toUpperCase() === 'PERIOD' || text.includes('/')) {
      console.debug(`Skipping RDATE with PERIOD value: ${text}`);
      continue;
    }

    for (const token of text.split(',')) {
      const value = token.trim();
      if (value) {
        entries.push({ value, tzid });
      }
    }
  }

  return entries;
}

function parseRdateValue(value: string, tzid: string | undefined): { start: Date; allDay: boolean } | null {
  const dateOnly = /^\d{8}$/.test(value);
  if (dateOnly) {
    const parsed = moment(value, 'YYYYMMDD', true);
    return parsed.isValid()
      ? { start: new Date(parsed.year(), parsed.month(), parsed.date(), 0, 0, 0, 0), allDay: true }
      : null;
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const parsed = moment.utc(value, 'YYYYMMDDTHHmmss[Z]', true);
    return parsed.isValid() ? { start: parsed.toDate(), allDay: false } : null;
  }

  if (/^\d{8}T\d{6}$/.test(value)) {
    // Floating times have always been read as host-local by node-ical's parser;
    // keep RDATE consistent with DTSTART rather than inventing a second rule.
    const parsed = tzid
      ? tz(value, 'YYYYMMDDTHHmmss', tzid)
      : moment(value, 'YYYYMMDDTHHmmss', true);
    return parsed.isValid() ? { start: parsed.toDate(), allDay: false } : null;
  }

  console.debug(`Skipping unrecognised RDATE value: ${value}`);
  return null;
}

/**
 * The occurrences a single VEVENT produces that could touch [from, to].
 *
 * RRULE expansion is delegated to node-ical's own expander, which resolves the
 * hard parts consistently: it carries each occurrence's full duration (so a
 * multi-day or overnight span survives), matches EXDATE by instant for
 * DATE-TIME and by date for VALUE=DATE, substitutes RECURRENCE-ID overrides for
 * the instances they name, and anchors VALUE=DATE occurrences at local midnight
 * so their labels don't drift by timezone.
 *
 * What it does not do, and this function adds:
 *   - drop occurrences whose VEVENT is STATUS:CANCELLED;
 *   - apply overrides to an event that has no RRULE (it returns only the
 *     master, ignoring the override that replaces or accompanies it);
 *   - expand RDATE.
 */
export function expandOccurrences(event: ProcessedEvent, from: Date, to: Date): Occurrence[] {
  if (isCancelled(event)) {
    console.debug(`Skipping cancelled event: ${textValue(event.summary)}`);
    return [];
  }

  const allDay = isFullDayEvent(event);
  const occurrences: Occurrence[] = event.rrule
    ? expandRuleOccurrences(event, from, to)
    : expandUnruledOccurrences(event, allDay);

  occurrences.push(...expandRdateOccurrences(event, allDay, occurrences));

  return occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function expandRuleOccurrences(
  event: ProcessedEvent,
  from: Date,
  to: Date,
): Occurrence[] {
  const instances = ical.expandRecurringEvent(event, { from, to, expandOngoing: true });

  return instances
    .filter(instance => !isCancelled(instance.event))
    .map(instance => toOccurrence(
      instance.event as ProcessedEvent,
      instance.start,
      instance.end,
      instance.isFullDay,
      instance.isOverride ? 'recurring override' : 'recurring',
    ));
}

/**
 * An event with no RRULE still has a recurrence set: its DTSTART, plus whatever
 * RECURRENCE-ID overrides are attached to it. Providers emit this shape both
 * when an override replaces the single instance outright and when a feed window
 * clips the RRULE away but leaves the overrides behind.
 */
function expandUnruledOccurrences(event: ProcessedEvent, allDay: boolean): Occurrence[] {
  if (!event.start || !event.end) {
    return [];
  }

  const overrides = overridesOf(event);
  const occurrences: Occurrence[] = [];
  const seenRecurrenceIds = new Set<number>();

  const emit = (source: ProcessedEvent, kind: OccurrenceKind): void => {
    if (!source.start || !source.end || isCancelled(source)) {
      return;
    }

    // A detached override names the instance it replaces, so two VEVENTs
    // sharing a RECURRENCE-ID are the same instance however many times
    // node-ical hands them to us.
    const recurrenceId = recurrenceIdOf(source);
    if (recurrenceId !== undefined) {
      if (seenRecurrenceIds.has(recurrenceId)) {
        return;
      }
      seenRecurrenceIds.add(recurrenceId);
    }

    const sourceAllDay = isFullDayEvent(source);
    occurrences.push(toOccurrence(
      source,
      sourceAllDay ? localMidnight(source.start) : source.start,
      sourceAllDay ? localMidnight(source.end) : source.end,
      sourceAllDay,
      kind,
    ));
  };

  // When the feed carries overrides but no master, node-ical promotes one of
  // them to the top level - so the event in hand may itself be an override
  // rather than the thing being overridden.
  if (event.recurrenceid instanceof Date) {
    emit(event, 'recurring override');
  }

  for (const override of overrides) {
    emit(override, 'recurring override');
  }

  if (!(event.recurrenceid instanceof Date)) {
    const masterReplaced = seenRecurrenceIds.has(event.start.getTime());
    if (!masterReplaced) {
      occurrences.push(toOccurrence(
        event,
        allDay ? localMidnight(event.start) : event.start,
        allDay ? localMidnight(event.end) : event.end,
        allDay,
        overrides.length > 0 ? 'recurring' : 'one-off',
      ));
    }
  }

  return occurrences;
}

function expandRdateOccurrences(
  event: ProcessedEvent,
  allDay: boolean,
  existing: Occurrence[],
): Occurrence[] {
  const entries = rdateEntries(event);
  if (entries.length === 0 || !event.start || !event.end) {
    return [];
  }

  const durationMs = event.end.getTime() - event.start.getTime();
  const taken = new Set(existing.map(occurrence => occurrence.start.getTime()));
  const excluded = new Set(
    Object.values((event.exdate ?? {}) as Record<string, Date>)
      .map(value => value.getTime()),
  );
  const overridden = new Set(
    overridesOf(event)
      .map(recurrenceIdOf)
      .filter((time): time is number => time !== undefined),
  );

  const added: Occurrence[] = [];

  for (const entry of entries) {
    const parsed = parseRdateValue(entry.value, entry.tzid);
    if (!parsed) {
      continue;
    }

    const startTime = parsed.start.getTime();
    if (taken.has(startTime) || excluded.has(startTime) || overridden.has(startTime)) {
      continue;
    }
    taken.add(startTime);

    const occurrenceAllDay = parsed.allDay || allDay;
    added.push(toOccurrence(
      event,
      parsed.start,
      new Date(startTime + durationMs),
      occurrenceAllDay,
      'recurring',
    ));
  }

  return added;
}

/**
 * The calendar days an occurrence appears on.
 *
 * With `showOngoing` off this is just the day it starts. With it on, the days
 * it covers: for a floating all-day occurrence, every date from DTSTART up to
 * but not including the exclusive DTEND; for a timed occurrence, every local
 * day it is in progress, where the final day counts only if the event actually
 * runs into it (an event ending at exactly midnight does not claim the next
 * day).
 */
export function occurrenceDays(occurrence: Occurrence, showOngoing: boolean): string[] {
  const startLabel = dateLabel(occurrence.start);
  if (!showOngoing) {
    return [startLabel];
  }

  const end = moment(occurrence.end);
  const endDay = end.clone().startOf('day');

  // Stepping by calendar days, not by 24-hour blocks: a spring-forward day is
  // 23 hours long, so subtracting a fixed day's worth of milliseconds from an
  // exclusive DTEND can land on the day before the intended last one.
  const lastDay = occurrence.allDay
    // DTEND is exclusive: an all-day event ending on Aug 5 last appears Aug 4.
    ? endDay.clone().subtract(1, 'day')
    : endDay;

  // A timed occurrence that ends exactly at midnight stops on the previous day.
  const endsOnItsLastDay = occurrence.allDay || end.isAfter(endDay);

  const days = [startLabel];
  const cursor = moment(occurrence.start).startOf('day');

  while (cursor.isBefore(lastDay, 'day')) {
    cursor.add(1, 'day');
    if (cursor.isSame(lastDay, 'day') && !endsOnItsLastDay) {
      break;
    }
    days.push(cursor.format('YYYY-MM-DD'));
  }

  return days;
}

/**
 * Every occurrence of every event that falls on one of `days`.
 *
 * `days` is a set of calendar days, not a range: passing Aug 3 and Aug 20 asks
 * for those two days, not the seventeen between them. (README's "Date Ranges"
 * example builds the whole list of days it wants, and RRULE matching has always
 * worked this way.) Each occurrence is emitted at most once however many of the
 * requested days it covers.
 */
export function selectOccurrences(
  events: ProcessedEvent[],
  days: string[],
  showOngoing: boolean,
): Occurrence[] {
  if (days.length === 0) {
    return [];
  }

  const requested = new Set(days);
  const sorted = [...days].sort();
  const from = moment(sorted[0], 'YYYY-MM-DD').startOf('day').toDate();
  const to = moment(sorted[sorted.length - 1], 'YYYY-MM-DD').endOf('day').toDate();

  const selected: Occurrence[] = [];

  for (const event of events) {
    for (const occurrence of expandOccurrences(event, from, to)) {
      if (occurrenceDays(occurrence, showOngoing).some(day => requested.has(day))) {
        selected.push(occurrence);
      }
    }
  }

  return selected;
}
