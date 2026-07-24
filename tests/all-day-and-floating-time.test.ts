import { parseIcs, filterMatchingEvents } from '../src/icalUtils';

// Regression coverage identified during a dissent pass: neither all-day
// recurring events (VALUE=DATE, no time component) nor floating-time/no-
// VTIMEZONE recurring events had any test coverage, despite the node-ical
// 0.27 upgrade rewriting the recurrence engine underneath both.
describe('all-day and floating-time recurring events', () => {
  it('handles an all-day (VALUE=DATE) weekly recurring event without crashing', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:all-day-weekly
DTSTART;VALUE=DATE:20260105
DTEND;VALUE=DATE:20260106
RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO
SUMMARY:All-day standup
DTSTAMP:20260101T090000Z
END:VEVENT
END:VCALENDAR`;

    const events = parseIcs(ics);
    expect(events.length).toBeGreaterThan(0);

    // Mondays in the series: Jan 5, 12, 19, 26 2026
    for (const date of ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']) {
      const matching = filterMatchingEvents(events, [date], false);
      expect(matching.length).toBe(1);
      expect(matching[0].summary).toBe('All-day standup');
    }

    // A Tuesday shouldn't match
    expect(filterMatchingEvents(events, ['2026-01-06'], false)).toHaveLength(0);
  });

  it('handles a floating-time recurring event with no VTIMEZONE block', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:floating-daily
DTSTART:20260201T090000
DTEND:20260201T093000
RRULE:FREQ=DAILY;COUNT=3
SUMMARY:Floating check-in
DTSTAMP:20260101T090000Z
END:VEVENT
END:VCALENDAR`;

    const events = parseIcs(ics);
    expect(events.length).toBeGreaterThan(0);

    for (const date of ['2026-02-01', '2026-02-02', '2026-02-03']) {
      const matching = filterMatchingEvents(events, [date], false);
      expect(matching.length).toBe(1);
      expect(matching[0].summary).toBe('Floating check-in');
    }
  });
});
