import { parseIcs, filterMatchingEvents } from '../src/icalUtils';

// Regression for open-horizon-labs/obsidian-ics#263: a VALUE=DATE event whose
// year is below 1000 (e.g. 09350928) used to make node-ical throw
// RangeError: Cannot parse: 9350-92-8 during parseICS, silently dropping the
// entire calendar. The root cause was in node-ical (buildDateOnlyStamp not
// zero-padding the year); this test locks the end-to-end behaviour on our side
// so a dependency regression is caught here, not in the field.
describe('issue-263: low-year VALUE=DATE recurring events', () => {
  const buildIcs = (year: string): string => `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:low-year-${year}
DTSTART;VALUE=DATE:${year}0928
RRULE:FREQ=YEARLY
SUMMARY:St. Wenceslas
DTSTAMP:20260101T000000Z
END:VEVENT
END:VCALENDAR`;

  it('does not drop the calendar for a year-935 all-day recurring event', () => {
    const events = parseIcs(buildIcs('0935'));

    // The reported bug: the whole calendar was dropped (0 events).
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe('St. Wenceslas');

    // The original (low) year must match.
    const originalYear = filterMatchingEvents(events, ['0935-09-28'], false);
    expect(originalYear).toHaveLength(1);
    expect(originalYear[0].summary).toBe('St. Wenceslas');

    // A modern year must also match (recurrence expansion works).
    const modernYear = filterMatchingEvents(events, ['2026-09-28'], false);
    expect(modernYear).toHaveLength(1);
    expect(modernYear[0].summary).toBe('St. Wenceslas');

    // A non-anniversary day must not match.
    expect(filterMatchingEvents(events, ['2026-09-29'], false)).toHaveLength(0);
  });

  it('preserves years 0000–0099 and the low-year boundaries', () => {
    for (const year of ['0000', '0001', '0004', '0099', '0100', '0999', '1000', '9999']) {
      const events = parseIcs(buildIcs(year));
      expect(events).toHaveLength(1);

      const lowYear = Number(year);
      const label = `${year}-09-28`;
      const matching = filterMatchingEvents(events, [label], false);
      expect(matching).toHaveLength(1);
      expect(matching[0].start.getFullYear()).toBe(lowYear);
      if (lowYear <= 2026) {
        expect(filterMatchingEvents(events, ['2026-09-28'], false)).toHaveLength(1);
      }
    }
  });
  it.each(['0000', '0004'])('preserves leap-day anniversaries starting in %s', (year) => {
    const events = parseIcs(buildIcs(year).replace(`${year}0928`, `${year}0229`));
    expect(events).toHaveLength(1);
    expect(events[0].start.getFullYear()).toBe(Number(year));
    expect(events[0].start.getMonth()).toBe(1);
    expect(events[0].start.getDate()).toBe(29);
    expect(filterMatchingEvents(events, [`${year}-02-29`], false)).toHaveLength(1);
    expect(filterMatchingEvents(events, ['2024-02-29'], false)).toHaveLength(1);
    expect(filterMatchingEvents(events, ['2025-03-01'], false)).toHaveLength(0);
  });

});
