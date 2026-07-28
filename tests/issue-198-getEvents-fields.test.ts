import type { App, PluginManifest } from 'obsidian';
import { moment } from 'obsidian';
import ICSPlugin from '../src/main';
import { DEFAULT_SETTINGS, DEFAULT_CALENDAR_FORMAT, Calendar } from '../src/settings/ICSSettings';

// Regression coverage for https://github.com/open-horizon-labs/obsidian-ics/issues/198.
//
// 1.14.4-beta1's release notes promised that
// app.plugins.getPlugin("ics").getEvents(...) would return startDateTime,
// endDateTime, endUtime and allDay alongside every existing IEvent field.
// The prior tests for this issue (multi-day-events.test.ts) only exercised
// eventDateFields() and filterMatchingEvents() directly - never the actual
// public getEvents() method a Dataview/Templater script calls, which is
// exactly the gap the beta2 bug report (a user seeing none of the four new
// fields via getEvents()) fell into. These tests go through
// ICSPlugin.prototype.getEvents() itself so a wiring regression between the
// helpers and the public API can't hide behind their unit tests.

const VCALENDAR_HEADER = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
`;

// Same VTIMEZONE definition icalUtils.test.ts uses for America/New_York, so
// the DST transition is driven by an explicit RRULE rather than an implicit
// IANA lookup.
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

// eventDateFields() formats startDateTime/endDateTime in the process's local
// timezone (moment(date).format() with no explicit zone), not the event's
// source TZID - so the offset in the assertions below only means what it
// claims to mean if this suite runs as America/New_York. Restored after the
// suite so it can't leak into other test files sharing this Jest worker.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
});

function icsWithEvent(uid: string, body: string, includeTimezone = false): string {
  return `${VCALENDAR_HEADER}${includeTimezone ? NEW_YORK_VTIMEZONE : ''}BEGIN:VEVENT
UID:${uid}
DTSTAMP:20260101T000000Z
SUMMARY:Test Event
${body}
END:VEVENT
END:VCALENDAR`;
}

// Builds a headless ICSPlugin backed by a single in-memory "vdir" calendar, so
// getEvents() runs its real vault-reading and event-assembly path without a
// network request or an Obsidian vault.
function createPlugin(icsContent: string, formatOverrides: Partial<Calendar['format']> = {}): ICSPlugin {
  const file = { extension: 'ics', path: 'calendar.ics' };
  const app = {
    vault: {
      getFiles: () => [file],
      read: async () => icsContent,
    },
  } as unknown as App;

  const plugin = new ICSPlugin(app, {} as PluginManifest);
  plugin.data = {
    ...DEFAULT_SETTINGS,
    calendars: {
      test: {
        icsUrl: 'calendar.ics',
        icsName: 'Test Calendar',
        calendarType: 'vdir',
        format: { ...DEFAULT_CALENDAR_FORMAT, ...formatOverrides },
      },
    },
  };
  return plugin;
}

describe('issue #198 - getEvents() exposes startDateTime/endDateTime/endUtime/allDay', () => {
  describe('timed multi-day event', () => {
    const ics = icsWithEvent(
      'timed-multi-day',
      `DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260804T170000`,
      true,
    );

    it('carries all four new fields on the start day, alongside every existing field', async () => {
      const plugin = createPlugin(ics, { showOngoing: true });
      const [event] = await plugin.getEvents('2026-08-03');

      expect(event).toBeDefined();
      expect(Object.getOwnPropertyNames(event)).toEqual(expect.arrayContaining([
        'utime', 'time', 'endTime', 'created', 'sequence', 'recurrent', 'lastModified',
        'icsName', 'summary', 'description', 'format', 'location', 'callUrl', 'callType',
        'extractedFields', 'organizer', 'attendees', 'eventType', 'uid', 'url',
        'startDateTime', 'endDateTime', 'endUtime', 'allDay',
      ]));

      expect(event.allDay).toBe(false);
      // Exact string, not just the parsed instant: the requirement is that
      // the ISO string itself carries the timezone offset (-04:00, EDT).
      expect(event.startDateTime).toBe('2026-08-03T09:00:00-04:00');
      expect(event.endDateTime).toBe('2026-08-04T17:00:00-04:00');
      expect(Number(event.endUtime)).toBe(moment.utc('2026-08-04T21:00:00Z').unix());
      expect(Number(event.endUtime)).toBeGreaterThan(Number(event.utime));
    });

    it('still reports the same start/end fields on the ongoing (end) day', async () => {
      const plugin = createPlugin(ics, { showOngoing: true });
      const [event] = await plugin.getEvents('2026-08-04');

      expect(event).toBeDefined();
      expect(event.allDay).toBe(false);
      expect(event.startDateTime).toBe('2026-08-03T09:00:00-04:00');
      expect(event.endDateTime).toBe('2026-08-04T17:00:00-04:00');
    });
  });

  describe('all-day multi-day event with exclusive DTEND', () => {
    // DTEND is exclusive for VALUE=DATE: this runs through Aug 4, ending at
    // the start of Aug 5.
    const ics = icsWithEvent('all-day-multi-day', `DTSTART;VALUE=DATE:20260803
DTEND;VALUE=DATE:20260805`);

    it('reports allDay true and an endDateTime at the start of the exclusive end day', async () => {
      const plugin = createPlugin(ics, { showOngoing: true });
      const [event] = await plugin.getEvents('2026-08-03');

      expect(event).toBeDefined();
      expect(event.allDay).toBe(true);
      expect(event.startDateTime).toBe('2026-08-03T00:00:00-04:00');
      expect(event.endDateTime).toBe('2026-08-05T00:00:00-04:00');
      // endUtime is the exclusive boundary itself (start of Aug 5), not the
      // inclusive last displayed day (Aug 4).
      expect(Number(event.endUtime)).toBe(moment.utc('2026-08-05T04:00:00Z').unix());
      expect(Number(event.endUtime)).toBe(1785902400);
    });
  });

  describe('"Show ongoing" filtering enabled vs. disabled', () => {
    const ics = icsWithEvent('ongoing-toggle', `DTSTART;VALUE=DATE:20260803
DTEND;VALUE=DATE:20260805`);

    it('includes Aug 3 and Aug 4, but not the exclusive Aug 5 end date, when enabled', async () => {
      const plugin = createPlugin(ics, { showOngoing: true });

      expect(await plugin.getEvents('2026-08-03')).toHaveLength(1);
      expect(await plugin.getEvents('2026-08-04')).toHaveLength(1);
      expect(await plugin.getEvents('2026-08-05')).toHaveLength(0);
    });

    it('includes only the start day when disabled', async () => {
      const plugin = createPlugin(ics, { showOngoing: false });

      expect(await plugin.getEvents('2026-08-03')).toHaveLength(1);
      expect(await plugin.getEvents('2026-08-04')).toHaveLength(0);
    });

    it('exposes the same startDateTime/endDateTime/endUtime/allDay values regardless of the toggle', async () => {
      const enabledPlugin = createPlugin(ics, { showOngoing: true });
      const disabledPlugin = createPlugin(ics, { showOngoing: false });

      const [fromEnabled] = await enabledPlugin.getEvents('2026-08-03');
      const [fromDisabled] = await disabledPlugin.getEvents('2026-08-03');

      expect(fromEnabled.startDateTime).toBe(fromDisabled.startDateTime);
      expect(fromEnabled.endDateTime).toBe(fromDisabled.endDateTime);
      expect(fromEnabled.endUtime).toBe(fromDisabled.endUtime);
      expect(fromEnabled.allDay).toBe(fromDisabled.allDay);
    });
  });

  describe('DST crossing (America/New_York spring-forward, 2026-03-08)', () => {
    // Starts at midnight EST (-05:00, before the 2am transition) and ends at
    // noon EDT (-04:00, after it) - a 12-hour local clock span that is
    // actually only 11 hours of elapsed time.
    const ics = icsWithEvent(
      'dst-crossing',
      `DTSTART;TZID=America/New_York:20260308T000000
DTEND;TZID=America/New_York:20260308T120000`,
      true,
    );

    it('resolves endUtime/endDateTime to the true elapsed instant, not a naive 12-hour clock offset', async () => {
      const plugin = createPlugin(ics, { showOngoing: true });
      const [event] = await plugin.getEvents('2026-03-08');

      expect(event).toBeDefined();
      expect(event.allDay).toBe(false);

      // Exact offset strings across the transition: -05:00 (EST) before,
      // -04:00 (EDT) after - not just the parsed instant, which would also
      // pass if the offset were wrongly rendered as UTC "Z".
      expect(event.startDateTime).toBe('2026-03-08T00:00:00-05:00');
      expect(event.endDateTime).toBe('2026-03-08T12:00:00-04:00');

      const expectedStart = moment.utc('2026-03-08T05:00:00Z');
      const expectedEnd = moment.utc('2026-03-08T16:00:00Z');
      expect(Number(event.utime)).toBe(expectedStart.unix());
      expect(Number(event.endUtime)).toBe(expectedEnd.unix());

      // 11 real hours elapsed across the spring-forward gap, not the 12
      // implied by the local 00:00-12:00 clock times.
      expect(Number(event.endUtime) - Number(event.utime)).toBe(11 * 3600);
    });
  });
});
