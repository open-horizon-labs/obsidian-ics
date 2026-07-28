import { moment } from 'obsidian';
import { parseIcs, filterMatchingEvents } from '../src/icalUtils';

// A timed occurrence belongs to the host's local day for that instant, the same
// day the daily note asking for it is named after. These tests are about
// recurrence expansion, not day attribution, so they derive the day they ask
// for from the occurrence's real instant - hard-coding the organiser's date
// would make them pass only on a host in the organiser's timezone.
const hostDay = (instant: string): string => moment(instant).format('YYYY-MM-DD');

describe('issue #190 - RRULE UNTIL boundary inclusivity', () => {
  // RFC 5545: UNTIL is inclusive. Fixed by the node-ical 0.27 upgrade
  // (rrule-temporal), which correctly includes an occurrence landing
  // exactly on the UNTIL instant instead of dropping it.
  it('includes the final occurrence when it lands exactly on the UNTIL instant', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VTIMEZONE
TZID:W. Europe Standard Time
BEGIN:STANDARD
DTSTART:16010101T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:until-boundary-test
DTSTART;TZID=W. Europe Standard Time:20260113T140000
DTEND;TZID=W. Europe Standard Time:20260113T150000
RRULE:FREQ=WEEKLY;UNTIL=20260630T120000Z;INTERVAL=2;BYDAY=TU;WKST=MO
SUMMARY:Biweekly meeting
DTSTAMP:20260101T120000Z
END:VEVENT
END:VCALENDAR`;
    const events = parseIcs(ics);
    // 2026-06-30 is the Tuesday the series lands exactly on the UNTIL instant (12:00 UTC = 14:00 local)
    const matching = filterMatchingEvents(events, [hostDay('2026-06-30T12:00:00.000Z')], false);
    expect(matching.length).toBe(1);
  });
});
