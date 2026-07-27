import { parseIcs, filterMatchingEvents } from '../src/icalUtils';
import { eventDateFields } from '../src/eventDates';

// Regression coverage for https://github.com/open-horizon-labs/obsidian-ics/issues/198
// A multi-day all-day event (a six-week German school holiday) reported as only
// ever showing on its start day, with no way to recover its end date because
// IEvent exposed endTime as a clock time only.
const vcalendar = (body: string) => `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:sommerferien-2026
DTSTAMP:20260101T000000Z
${body}
SUMMARY:Sommerferien Bayern 2026
END:VEVENT
END:VCALENDAR`;

// DTEND is exclusive for VALUE=DATE, so this runs through Sep 14.
const ALL_DAY_MULTI_DAY = vcalendar(`DTSTART;VALUE=DATE:20260803
DTEND;VALUE=DATE:20260915`);

describe('issue #198 - multi-day all-day events', () => {
  describe('day matching', () => {
    it('matches every day of the span when showOngoing is enabled', () => {
      const events = parseIcs(ALL_DAY_MULTI_DAY);

      for (const day of ['2026-08-03', '2026-08-20', '2026-09-14']) {
        expect(filterMatchingEvents(events, [day], true)).toHaveLength(1);
      }
    });

    it('excludes the exclusive DTEND day', () => {
      const events = parseIcs(ALL_DAY_MULTI_DAY);

      expect(filterMatchingEvents(events, ['2026-09-15'], true)).toHaveLength(0);
    });

    it('matches only the start day when showOngoing is disabled', () => {
      const events = parseIcs(ALL_DAY_MULTI_DAY);

      expect(filterMatchingEvents(events, ['2026-08-03'], false)).toHaveLength(1);
      expect(filterMatchingEvents(events, ['2026-08-20'], false)).toHaveLength(0);
      expect(filterMatchingEvents(events, ['2026-09-14'], false)).toHaveLength(0);
    });
  });

  describe('exposed date fields', () => {
    it('exposes the full start and end, not just clock times', () => {
      const [event] = parseIcs(ALL_DAY_MULTI_DAY);

      const fields = eventDateFields(event, 'HH:mm');

      expect(fields.allDay).toBe(true);
      // Clock times alone can't distinguish this from a zero-length event -
      // this is what the issue reporter was seeing.
      expect(fields.time).toBe('00:00');
      expect(fields.endTime).toBe('00:00');
      // The dates are what make the six-week span recoverable.
      expect(fields.startDateTime).toContain('2026-08-03T00:00:00');
      expect(fields.endDateTime).toContain('2026-09-15T00:00:00');
    });

    it('gives endUtime as a sortable end timestamp', () => {
      const [event] = parseIcs(ALL_DAY_MULTI_DAY);

      const fields = eventDateFields(event, 'HH:mm');

      expect(Number(fields.endUtime)).toBeGreaterThan(Number(fields.utime));
      // The inclusive last day, which is what an all-day event displays as.
      const lastDay = new Date((Number(fields.endUtime) - 86400) * 1000);
      expect(lastDay.getFullYear()).toBe(2026);
      expect(lastDay.getMonth() + 1).toBe(9);
      expect(lastDay.getDate()).toBe(14);
    });

    it('marks timed events as not all-day', () => {
      const [event] = parseIcs(vcalendar(`DTSTART:20260803T090000Z
DTEND:20260803T103000Z`));

      const fields = eventDateFields(event, 'HH:mm');

      expect(fields.allDay).toBe(false);
      expect(fields.startDateTime).toContain('2026-08-03T');
      expect(fields.endDateTime).toContain('2026-08-03T');
    });
  });

  // DURATION is a legal alternative to DTEND (RFC 5545), and DTEND/DURATION can
  // both be absent. node-ical resolves all three into `end` for us; these pin
  // that down so the exposed end fields can't silently become empty.
  describe('ends expressed without DTEND', () => {
    it('resolves an end from DURATION', () => {
      const [event] = parseIcs(vcalendar(`DTSTART;VALUE=DATE:20260803
DURATION:P43D`));

      const fields = eventDateFields(event, 'HH:mm');

      expect(fields.endDateTime).toContain('2026-09-15T00:00:00');
      expect(filterMatchingEvents([event], ['2026-08-20'], true)).toHaveLength(1);
    });

    it('defaults an all-day event with no DTEND or DURATION to one day', () => {
      const [event] = parseIcs(vcalendar('DTSTART;VALUE=DATE:20260803'));

      const fields = eventDateFields(event, 'HH:mm');

      expect(fields.endDateTime).toContain('2026-08-04T00:00:00');
      expect(filterMatchingEvents([event], ['2026-08-04'], true)).toHaveLength(0);
    });
  });
});
