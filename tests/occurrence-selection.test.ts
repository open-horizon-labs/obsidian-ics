import { moment } from 'obsidian';
import { parseIcs, filterMatchingEvents, textValue } from '../src/icalUtils';

// Systematic coverage for occurrence selection: which concrete occurrences
// filterMatchingEvents() emits for a given set of days, and with what
// start/end instants and recurrence metadata.
//
// Every case here was reproduced against the pre-fix implementation before
// being written down (see the PR description for the confirmed-findings
// table). Cases that turned out to be correct behaviour are recorded in the
// "already correct" describe block as regression guards, not as fixes.
//
// Assertions use absolute UTC instants (toISOString) for timed events, and
// calendar-date labels for VALUE=DATE events. That split is deliberate:
// RFC 5545 DATE values are floating calendar dates whose label must not move
// with the host timezone, while DATE-TIME values are instants. Asserting a
// timed event against a local clock string would only re-encode the host
// timezone into the expectation.

const NEW_YORK_VTIMEZONE = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:STANDARD
DTSTART:20071104T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZNAME:EST
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:20070311T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZNAME:EDT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
END:VTIMEZONE
`;

function vcalendar(body: string, withTimezone = false): string {
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
${withTimezone ? NEW_YORK_VTIMEZONE : ''}${body}
END:VCALENDAR`;
}

const iso = (date?: Date): string | undefined => date?.toISOString();
const dayLabel = (date?: Date): string | undefined =>
  date === undefined ? undefined : moment(date).format('YYYY-MM-DD');

// A timed occurrence belongs to the day the host is on when it happens - the
// same rule the daily note the query came from uses. So a test for a timed
// event has to ask for the host's day for that instant, not the day it happens
// to be in the organiser's timezone; hard-coding the latter would only assert
// that the suite is running in the fixture's timezone. VALUE=DATE fixtures keep
// literal labels: those are floating dates and must not move at all.
const hostDay = (instant: string): string => moment(instant).format('YYYY-MM-DD');
const hostDayAfter = (instant: string, days: number): string =>
  moment(instant).add(days, 'day').format('YYYY-MM-DD');

describe('occurrence selection', () => {
  describe('recurring occurrences keep their own start and end', () => {
    // An overnight series: 21:00 -> 01:00 the next day, in America/New_York.
    // 21:00 EDT is 01:00 UTC the following day, so the occurrence instant's
    // UTC date and its New York date are different days - which is exactly
    // where rebuilding both endpoints from the instant's UTC date goes wrong.
    const OVERNIGHT_SERIES = vcalendar(`BEGIN:VEVENT
UID:overnight-series
DTSTAMP:20260101T000000Z
SUMMARY:Overnight series
DTSTART;TZID=America/New_York:20260803T210000
DTEND;TZID=America/New_York:20260804T010000
RRULE:FREQ=DAILY;COUNT=5
END:VEVENT`, true);

    it('places an overnight occurrence on the day it starts in its own timezone', () => {
      const startDay = hostDay('2026-08-04T01:00:00.000Z');
      const matching = filterMatchingEvents(parseIcs(OVERNIGHT_SERIES), [startDay], false);

      expect(matching).toHaveLength(1);
      expect(iso(matching[0].start)).toBe('2026-08-04T01:00:00.000Z'); // 2026-08-03 21:00 EDT
    });

    it('preserves the start-to-end day offset of an overnight occurrence', () => {
      const startDay = hostDay('2026-08-04T01:00:00.000Z');
      const matching = filterMatchingEvents(parseIcs(OVERNIGHT_SERIES), [startDay], false);

      expect(matching).toHaveLength(1);
      expect(iso(matching[0].end)).toBe('2026-08-04T05:00:00.000Z'); // 2026-08-04 01:00 EDT
      const durationMinutes =
        (Number(matching[0].end) - Number(matching[0].start)) / 60_000;
      expect(durationMinutes).toBe(240);
    });

    it('preserves a multi-day span on every occurrence, not just the first', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:multi-day-series
DTSTAMP:20260101T000000Z
SUMMARY:Multi-day series
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260805T170000
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT`, true));

      // The second occurrence starts 2026-08-10 09:00 EDT and ends 2026-08-12 17:00 EDT.
      const matching = filterMatchingEvents(events, [hostDay('2026-08-10T13:00:00.000Z')], false);

      expect(matching).toHaveLength(1);
      expect(iso(matching[0].start)).toBe('2026-08-10T13:00:00.000Z');
      expect(iso(matching[0].end)).toBe('2026-08-12T21:00:00.000Z');
    });

    it('serves an ongoing day of a later occurrence from that occurrence', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:multi-day-ongoing
DTSTAMP:20260101T000000Z
SUMMARY:Multi-day series
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260805T170000
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT`, true));

      // The day after the second occurrence starts is a middle day of it.
      const matching = filterMatchingEvents(events, [hostDayAfter('2026-08-10T13:00:00.000Z', 1)], true);

      expect(matching).toHaveLength(1);
      expect(iso(matching[0].start)).toBe('2026-08-10T13:00:00.000Z');
      expect(matching[0].eventType).toBe('recurring');
      expect(matching[0].recurrent).toBe(true);
    });

    it('reports the same occurrence metadata whichever of its days is queried', () => {
      const ics = vcalendar(`BEGIN:VEVENT
UID:metadata-stability
DTSTAMP:20260101T000000Z
SUMMARY:Multi-day series
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260805T170000
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT`, true);

      const startDay = hostDay('2026-08-10T13:00:00.000Z');
      const ongoingDay = hostDayAfter('2026-08-10T13:00:00.000Z', 1);
      const [fromStartDay] = filterMatchingEvents(parseIcs(ics), [startDay], true);
      const [fromOngoingDay] = filterMatchingEvents(parseIcs(ics), [ongoingDay], true);

      expect(iso(fromOngoingDay.start)).toBe(iso(fromStartDay.start));
      expect(iso(fromOngoingDay.end)).toBe(iso(fromStartDay.end));
      expect(fromOngoingDay.eventType).toBe(fromStartDay.eventType);
      expect(fromOngoingDay.recurrent).toBe(fromStartDay.recurrent);
    });
  });

  describe('VALUE=DATE occurrences keep their calendar-date label in any timezone', () => {
    // DATE values are floating calendar dates. Aug 10 must stay Aug 10 whether
    // the host is UTC-11 or UTC+14 - this is the case that fails today for
    // every user at a positive UTC offset (see the timezone matrix script).
    const ALL_DAY_SERIES = vcalendar(`BEGIN:VEVENT
UID:all-day-series
DTSTAMP:20260101T000000Z
SUMMARY:All-day series
DTSTART;VALUE=DATE:20260803
DTEND;VALUE=DATE:20260804
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT`);

    it('matches each weekly all-day occurrence on its own date', () => {
      for (const day of ['2026-08-03', '2026-08-10', '2026-08-17']) {
        const matching = filterMatchingEvents(parseIcs(ALL_DAY_SERIES), [day], false);

        expect(matching).toHaveLength(1);
        expect(dayLabel(matching[0].start)).toBe(day);
      }
    });

    it('does not match the day after a single-day all-day occurrence', () => {
      expect(filterMatchingEvents(parseIcs(ALL_DAY_SERIES), ['2026-08-11'], true)).toHaveLength(0);
    });

    it('includes a last day that is a 23-hour spring-forward day', () => {
      // America/New_York springs forward on 2026-03-08, so that local day is
      // only 23 hours long. Deriving the last covered day by subtracting 24h
      // from the exclusive DTEND lands on 2026-03-07 and silently drops it.
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:all-day-over-spring-forward
DTSTAMP:20260101T000000Z
SUMMARY:Spans the DST change
DTSTART;VALUE=DATE:20260306
DTEND;VALUE=DATE:20260309
END:VEVENT`));

      for (const day of ['2026-03-06', '2026-03-07', '2026-03-08']) {
        expect(filterMatchingEvents(events, [day], true)).toHaveLength(1);
      }
      expect(filterMatchingEvents(events, ['2026-03-09'], true)).toHaveLength(0);
    });

    it('spans a multi-day all-day occurrence up to but not including its exclusive DTEND', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:all-day-multi-day-series
DTSTAMP:20260101T000000Z
SUMMARY:All-day multi-day series
DTSTART;VALUE=DATE:20260803
DTEND;VALUE=DATE:20260806
RRULE:FREQ=WEEKLY;COUNT=2
END:VEVENT`));

      // Second occurrence covers Aug 10, 11, 12; DTEND Aug 13 is exclusive.
      expect(filterMatchingEvents(events, ['2026-08-10'], true)).toHaveLength(1);
      expect(filterMatchingEvents(events, ['2026-08-12'], true)).toHaveLength(1);
      expect(filterMatchingEvents(events, ['2026-08-13'], true)).toHaveLength(0);
    });
  });

  describe('EXDATE removes only what it names', () => {
    it('removes a single DATE-TIME instance, not the whole day', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:hourly-with-exdate
DTSTAMP:20260101T000000Z
SUMMARY:Hourly
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T093000
RRULE:FREQ=HOURLY;COUNT=12
EXDATE;TZID=America/New_York:20260803T110000
END:VEVENT`, true));

      // The twelve hourly instants run 13:00Z to 24:00Z, which straddles local
      // midnight in some host timezones - ask for every day they can land on.
      const days = [...new Set([
        hostDay('2026-08-03T13:00:00.000Z'),
        hostDay('2026-08-04T00:00:00.000Z'),
      ])];
      const matching = filterMatchingEvents(events, days, false);

      expect(matching).toHaveLength(11);
      expect(matching.map(e => iso(e.start))).not.toContain('2026-08-03T15:00:00.000Z');
    });

    it('removes every instance on the named date for a VALUE=DATE exclusion', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:all-day-with-exdate
DTSTAMP:20260101T000000Z
SUMMARY:All-day series
DTSTART;VALUE=DATE:20260803
DTEND;VALUE=DATE:20260804
RRULE:FREQ=DAILY;COUNT=5
EXDATE;VALUE=DATE:20260805
END:VEVENT`));

      expect(filterMatchingEvents(events, ['2026-08-05'], false)).toHaveLength(0);
      expect(filterMatchingEvents(events, ['2026-08-04'], false)).toHaveLength(1);
      expect(filterMatchingEvents(events, ['2026-08-06'], false)).toHaveLength(1);
    });
  });

  describe('recurrence overrides replace exactly the instance they name', () => {
    it('replaces one instance of a same-day series without dropping the rest', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:hourly-with-override
DTSTAMP:20260101T000000Z
SUMMARY:Hourly
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T093000
RRULE:FREQ=HOURLY;COUNT=6
END:VEVENT
BEGIN:VEVENT
UID:hourly-with-override
RECURRENCE-ID;TZID=America/New_York:20260803T110000
DTSTAMP:20260101T000000Z
SUMMARY:Hourly (moved)
DTSTART;TZID=America/New_York:20260803T113000
DTEND;TZID=America/New_York:20260803T120000
END:VEVENT`, true));

      // The six hourly instants run 13:00Z to 18:00Z, which straddles local
      // midnight for hosts around UTC+9 - ask for every day they can land on.
      const days = [...new Set([
        hostDay('2026-08-03T13:00:00.000Z'),
        hostDay('2026-08-03T18:00:00.000Z'),
      ])];
      const matching = filterMatchingEvents(events, days, false);

      // Five untouched occurrences plus the replacement for the 11:00 one.
      expect(matching).toHaveLength(6);
      expect(matching.map(e => iso(e.start))).toContain('2026-08-03T15:30:00.000Z');
      expect(matching.map(e => iso(e.start))).not.toContain('2026-08-03T15:00:00.000Z');
    });

    it('keeps a master occurrence that has an override on a different day', () => {
      const ics = vcalendar(`BEGIN:VEVENT
UID:master-with-detached-override
DTSTAMP:20260101T000000Z
SUMMARY:Master
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T100000
END:VEVENT
BEGIN:VEVENT
UID:master-with-detached-override
RECURRENCE-ID;TZID=America/New_York:20260810T090000
DTSTAMP:20260101T000000Z
SUMMARY:Detached
DTSTART;TZID=America/New_York:20260810T140000
DTEND;TZID=America/New_York:20260810T150000
END:VEVENT`, true);

      const onMasterDay = filterMatchingEvents(
        parseIcs(ics), [hostDay('2026-08-03T13:00:00.000Z')], false);
      expect(onMasterDay).toHaveLength(1);
      expect(onMasterDay[0].summary).toBe('Master');

      const onOverrideDay = filterMatchingEvents(
        parseIcs(ics), [hostDay('2026-08-10T18:00:00.000Z')], false);
      expect(onOverrideDay).toHaveLength(1);
      expect(onOverrideDay[0].summary).toBe('Detached');
    });
  });

  describe('the queried days are a set, not a range', () => {
    // README documents passing every wanted day explicitly ("Date Ranges"
    // builds a 7-element array), and the RRULE path has always matched days
    // exactly. One-off and override matching must agree with that.
    it('does not return a one-off falling between two sparse query days', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:between-the-days
DTSTAMP:20260101T000000Z
SUMMARY:Between the days
DTSTART;TZID=America/New_York:20260810T120000
DTEND;TZID=America/New_York:20260810T130000
END:VEVENT`, true));

      const eventDay = hostDay('2026-08-10T16:00:00.000Z');
      const before = hostDayAfter('2026-08-10T16:00:00.000Z', -7);
      const after = hostDayAfter('2026-08-10T16:00:00.000Z', 10);

      expect(filterMatchingEvents(events, [before, after], false)).toHaveLength(0);
      expect(filterMatchingEvents(events, [eventDay], false)).toHaveLength(1);
    });

    it('does not return an override falling between two sparse query days', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:override-between-the-days
DTSTAMP:20260101T000000Z
SUMMARY:Series
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T100000
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT
BEGIN:VEVENT
UID:override-between-the-days
RECURRENCE-ID;TZID=America/New_York:20260810T090000
DTSTAMP:20260101T000000Z
SUMMARY:Series (moved)
DTSTART;TZID=America/New_York:20260810T140000
DTEND;TZID=America/New_York:20260810T150000
END:VEVENT`, true));

      const firstDay = hostDay('2026-08-03T13:00:00.000Z');
      const lastDay = hostDay('2026-08-24T13:00:00.000Z');
      const matching = filterMatchingEvents(events, [firstDay, lastDay], false);

      expect(matching.map(e => textValue(e.summary))).not.toContain('Series (moved)');
      expect(matching).toHaveLength(2); // first and last occurrences only
    });
  });

  describe('an occurrence is emitted once per query', () => {
    it('returns an overnight one-off once when both of its days are queried', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:overnight-one-off
DTSTAMP:20260101T000000Z
SUMMARY:Overnight one-off
DTSTART;TZID=America/New_York:20260803T220000
DTEND;TZID=America/New_York:20260804T020000
END:VEVENT`, true));

      // Both branches that used to emit this - the one-off match on its start
      // day and the ongoing match on its end day - fired for the same event.
      const days = [...new Set([
        hostDay('2026-08-04T02:00:00.000Z'),
        hostDay('2026-08-04T06:00:00.000Z'),
      ])];

      expect(filterMatchingEvents(events, days, true)).toHaveLength(1);
    });

    it('returns a multi-day event once when several of its days are queried', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:multi-day-one-off
DTSTAMP:20260101T000000Z
SUMMARY:Multi-day one-off
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260806T170000
END:VEVENT`, true));

      const start = '2026-08-03T13:00:00.000Z';
      const days = [hostDay(start), hostDayAfter(start, 1), hostDayAfter(start, 2)];

      expect(filterMatchingEvents(events, days, true)).toHaveLength(1);
    });
  });

  describe('all-day events re-exported as midnight-to-23:59:59 timed events', () => {
    it('spans the original calendar dates, exclusive of the day after the last', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:berlin-reexport
DTSTAMP:20260101T000000Z
SUMMARY:Sommerferien
DTSTART;TZID=Europe/Berlin:20260803T000000
DTEND;TZID=Europe/Berlin:20260914T235959
END:VEVENT`));

      for (const day of ['2026-08-03', '2026-08-20', '2026-09-14']) {
        const matching = filterMatchingEvents(events, [day], true);
        expect(matching).toHaveLength(1);
        expect(dayLabel(matching[0].start)).toBe('2026-08-03');
      }

      expect(filterMatchingEvents(events, ['2026-09-15'], true)).toHaveLength(0);
      expect(filterMatchingEvents(events, ['2026-08-02'], true)).toHaveLength(0);
    });

    it('matches only the first day when showOngoing is disabled', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:berlin-reexport-no-ongoing
DTSTAMP:20260101T000000Z
SUMMARY:Sommerferien
DTSTART;TZID=Europe/Berlin:20260803T000000
DTEND;TZID=Europe/Berlin:20260914T235959
END:VEVENT`));

      expect(filterMatchingEvents(events, ['2026-08-03'], false)).toHaveLength(1);
      expect(filterMatchingEvents(events, ['2026-08-20'], false)).toHaveLength(0);
    });

    it('handles a span that crosses a DST change in the declared timezone', () => {
      // Europe/Berlin leaves summer time on 2026-10-25, so this span is not a
      // whole number of elapsed hours - the dates still have to come out right.
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:berlin-dst-span
DTSTAMP:20260101T000000Z
SUMMARY:Herbstferien
DTSTART;TZID=Europe/Berlin:20261019T000000
DTEND;TZID=Europe/Berlin:20261031T235959
END:VEVENT`));

      for (const day of ['2026-10-19', '2026-10-26', '2026-10-31']) {
        expect(filterMatchingEvents(events, [day], true)).toHaveLength(1);
      }
      expect(filterMatchingEvents(events, ['2026-11-01'], true)).toHaveLength(0);
    });

    it('applies to each occurrence of a recurring re-exported all-day event', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:berlin-reexport-weekly
DTSTAMP:20260101T000000Z
SUMMARY:Weekly all-day
DTSTART;TZID=Europe/Berlin:20260803T000000
DTEND;TZID=Europe/Berlin:20260804T235959
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT`));

      for (const day of ['2026-08-03', '2026-08-04', '2026-08-10', '2026-08-11']) {
        const matching = filterMatchingEvents(events, [day], true);
        expect(matching).toHaveLength(1);
      }
      expect(filterMatchingEvents(events, ['2026-08-05'], true)).toHaveLength(0);
    });

    it('keeps every occurrence of a recurring series that crosses a DST change', () => {
      // Europe/Berlin leaves summer time on 2026-10-25, inside the first
      // occurrence. node-ical expands a series by preserving *elapsed*
      // duration, so from the second occurrence on, the end lands at 00:59:59
      // the following day rather than 23:59:59 - the wall clock the source was
      // written with is gone. Only the calendar-day span survives, so that is
      // what the compatibility rule has to carry forward.
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:berlin-reexport-dst
DTSTAMP:20260101T000000Z
SUMMARY:Herbstferien
DTSTART;TZID=Europe/Berlin:20261024T000000
DTEND;TZID=Europe/Berlin:20261025T235959
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT`));

      // Each occurrence covers two calendar days, in Berlin's calendar.
      for (const day of ['2026-10-24', '2026-10-25', '2026-10-31', '2026-11-01', '2026-11-07', '2026-11-08']) {
        const matching = filterMatchingEvents(events, [day], true);
        expect(matching).toHaveLength(1);
        expect(matching[0].datetype).toBe('date');
      }

      for (const day of ['2026-10-23', '2026-10-26', '2026-10-30', '2026-11-02', '2026-11-06', '2026-11-09']) {
        expect(filterMatchingEvents(events, [day], true)).toHaveLength(0);
      }
    });

    it('does not reclassify when DTSTART and DTEND name different timezones', () => {
      // Europe/London 22:59:59 BST is 23:59:59 CEST, so read in the start's
      // zone alone this looks like end-of-day. It isn't: the event declares an
      // end at 22:59:59 London time, and a range straddling two declared zones
      // is not a single calendar-day span.
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:mismatched-zones
DTSTAMP:20260101T000000Z
SUMMARY:Mismatched zones
DTSTART;TZID=Europe/Berlin:20260803T000000
DTEND;TZID=Europe/London:20260914T225959
END:VEVENT`));

      const matching = filterMatchingEvents(events, [hostDay('2026-08-02T22:00:00.000Z')], true);

      expect(matching).toHaveLength(1);
      expect(matching[0].datetype).toBe('date-time');
      expect(iso(matching[0].end)).toBe('2026-09-14T21:59:59.000Z');
    });

    it('does not treat a near-miss timed event as all-day', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:near-miss
DTSTAMP:20260101T000000Z
SUMMARY:Near miss
DTSTART;TZID=Europe/Berlin:20260803T000000
DTEND;TZID=Europe/Berlin:20260914T235958
END:VEVENT`));

      // One second short of the end of the day: still an ordinary timed event,
      // so its end stays put rather than rolling to the next midnight.
      const matching = filterMatchingEvents(events, [hostDay('2026-08-02T22:00:00.000Z')], true);

      expect(matching).toHaveLength(1);
      expect(iso(matching[0].end)).toBe('2026-09-14T21:59:58.000Z');
    });
  });

  describe('RDATE occurrences', () => {
    it('includes an occurrence added by RDATE', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:rdate-series
DTSTAMP:20260101T000000Z
SUMMARY:RDATE series
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T100000
RDATE;TZID=America/New_York:20260807T090000
END:VEVENT`, true));

      const matching = filterMatchingEvents(events, [hostDay('2026-08-07T13:00:00.000Z')], false);

      expect(matching).toHaveLength(1);
      expect(iso(matching[0].start)).toBe('2026-08-07T13:00:00.000Z');
      expect(iso(matching[0].end)).toBe('2026-08-07T14:00:00.000Z');
    });

    it('still returns the DTSTART occurrence alongside RDATE occurrences', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:rdate-plus-dtstart
DTSTAMP:20260101T000000Z
SUMMARY:RDATE series
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T100000
RDATE;TZID=America/New_York:20260807T090000
END:VEVENT`, true));

      expect(filterMatchingEvents(events, [hostDay('2026-08-03T13:00:00.000Z')], false))
        .toHaveLength(1);
    });
  });

  describe('filtering does not mutate its input', () => {
    it('leaves the parsed events untouched so they can be filtered again', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:no-mutation
DTSTAMP:20260101T000000Z
SUMMARY:No mutation
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T100000
END:VEVENT`, true));

      const before = JSON.stringify(events);
      filterMatchingEvents(events, [hostDay('2026-08-03T13:00:00.000Z')], false);

      expect(JSON.stringify(events)).toBe(before);
    });

    it('gives the same answer when the same parsed array is filtered twice', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:repeatable
DTSTAMP:20260101T000000Z
SUMMARY:Repeatable
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T100000
END:VEVENT`, true));

      const otherDay = hostDayAfter('2026-08-03T13:00:00.000Z', 5);
      const first = filterMatchingEvents(events, [otherDay], false);
      const second = filterMatchingEvents(events, [otherDay], false);

      expect(first).toHaveLength(0);
      expect(second).toHaveLength(0);
    });
  });

  // Behaviour that was investigated as suspect and turned out to be correct.
  // Kept as guards so the fixes above can't silently change it.
  describe('already correct (regression guards)', () => {
    const SERIES = vcalendar(`BEGIN:VEVENT
UID:query-shapes
DTSTAMP:20260101T000000Z
SUMMARY:Series
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T100000
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT`, true);

    const FIRST_DAY = hostDay('2026-08-03T13:00:00.000Z');
    const SECOND_DAY = hostDay('2026-08-10T13:00:00.000Z');

    it('ignores duplicate query days', () => {
      expect(filterMatchingEvents(parseIcs(SERIES), [FIRST_DAY, FIRST_DAY], false))
        .toHaveLength(1);
    });

    it('ignores query day order', () => {
      const ascending = filterMatchingEvents(parseIcs(SERIES), [FIRST_DAY, SECOND_DAY], false);
      const descending = filterMatchingEvents(parseIcs(SERIES), [SECOND_DAY, FIRST_DAY], false);

      expect(descending).toHaveLength(ascending.length);
      expect(descending.map(e => iso(e.start)).sort())
        .toEqual(ascending.map(e => iso(e.start)).sort());
    });

    it('emits both a moved override and the genuine occurrence on the destination day', () => {
      // Two distinct occurrences legitimately land on Aug 6: the daily
      // occurrence, and the Aug 4 instance that was moved there.
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:override-collision
DTSTAMP:20260101T000000Z
SUMMARY:Daily
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T100000
RRULE:FREQ=DAILY;COUNT=5
END:VEVENT
BEGIN:VEVENT
UID:override-collision
RECURRENCE-ID;TZID=America/New_York:20260804T090000
DTSTAMP:20260101T000000Z
SUMMARY:Daily (moved onto Aug 6)
DTSTART;TZID=America/New_York:20260806T150000
DTEND;TZID=America/New_York:20260806T160000
END:VEVENT`, true));

      // Assert on the instants rather than a count: depending on the host's
      // offset the two occurrences can fall on one local day or two, and a
      // second day pulls in that day's own occurrence as well.
      const days = [...new Set([
        hostDay('2026-08-06T13:00:00.000Z'),
        hostDay('2026-08-06T19:00:00.000Z'),
      ])];
      const starts = filterMatchingEvents(events, days, false).map(e => iso(e.start));

      expect(starts).toContain('2026-08-06T13:00:00.000Z'); // the daily occurrence
      expect(starts).toContain('2026-08-06T19:00:00.000Z'); // the moved override
      expect(starts).not.toContain('2026-08-04T13:00:00.000Z'); // its original slot
    });

    it('skips a cancelled override and the instance it replaced', () => {
      const events = parseIcs(vcalendar(`BEGIN:VEVENT
UID:cancelled-override
DTSTAMP:20260101T000000Z
SUMMARY:Daily
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T100000
RRULE:FREQ=DAILY;COUNT=5
END:VEVENT
BEGIN:VEVENT
UID:cancelled-override
RECURRENCE-ID;TZID=America/New_York:20260804T090000
DTSTAMP:20260101T000000Z
STATUS:CANCELLED
SUMMARY:Daily
DTSTART;TZID=America/New_York:20260804T090000
DTEND;TZID=America/New_York:20260804T100000
END:VEVENT`, true));

      expect(filterMatchingEvents(events, [hostDay('2026-08-04T13:00:00.000Z')], false))
        .toHaveLength(0);
      expect(filterMatchingEvents(events, [hostDay('2026-08-05T13:00:00.000Z')], false))
        .toHaveLength(1);
    });
  });
});
