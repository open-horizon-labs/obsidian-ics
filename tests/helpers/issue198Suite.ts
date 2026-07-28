import { moment } from 'obsidian';

// Shared regression coverage for https://github.com/open-horizon-labs/obsidian-ics/issues/198,
// run against two different ICSPlugin constructors:
//   - tests/issue-198-getEvents-fields.test.ts drives the TypeScript source (src/main.ts).
//   - tests/issue-198-dist-artifact.test.ts drives the compiled release artifact
//     (dist/main.js, and a copy of it in an isolated plugin folder), which is the
//     thing #198 was actually about: the source was always correct, but nobody had
//     ever asserted that the *built, shipped* main.js exposes the same public API.
//
// Deliberately no imports from src/ here: this file is reused by the dist-artifact
// suite, and the whole point of that suite is that it cannot pass by re-testing
// TypeScript source instead of the compiled bundle. The tiny settings/format
// defaults below are inlined literals (mirroring, but not importing,
// src/settings/ICSSettings's DEFAULT_SETTINGS/DEFAULT_CALENDAR_FORMAT) so this file
// has zero dependency on src/.

const VCALENDAR_HEADER = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
`;

// Same VTIMEZONE definition icalUtils.test.ts uses for America/New_York, so the
// DST transition is driven by an explicit RRULE rather than an implicit IANA lookup.
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

function icsWithEvent(uid: string, body: string, includeTimezone = false): string {
  return `${VCALENDAR_HEADER}${includeTimezone ? NEW_YORK_VTIMEZONE : ''}BEGIN:VEVENT
UID:${uid}
DTSTAMP:20260101T000000Z
SUMMARY:Test Event
${body}
END:VEVENT
END:VCALENDAR`;
}

// Minimal literal stand-ins for Calendar['format'] and ICSSettings, inlined
// rather than imported from src/settings/ICSSettings (see file-level comment).
const BASE_CALENDAR_FORMAT = {
  checkbox: true,
  includeEventEndTime: true,
  icsName: true,
  summary: true,
  location: true,
  description: false,
  calendarType: 'remote',
  showAttendees: false,
  showOngoing: true,
  showTransparentEvents: false,
};

function baseSettings(calendarFormatOverrides: Record<string, unknown>) {
  return {
    format: {
      timeFormat: 'HH:mm',
      dataViewSyntax: false,
    },
    calendars: {
      test: {
        icsUrl: 'calendar.ics',
        icsName: 'Test Calendar',
        calendarType: 'vdir',
        format: { ...BASE_CALENDAR_FORMAT, ...calendarFormatOverrides },
      },
    },
    fieldExtraction: {
      enabled: true,
      patterns: [],
    },
  };
}

// The subset of ICSPlugin's public surface this suite actually exercises. Both
// the source class and the compiled dist class satisfy this structurally -
// this interface is what makes the suite constructor-agnostic.
export interface Issue198PluginLike {
  data: unknown;
  getEvents(...dates: string[]): Promise<Record<string, unknown>[]>;
}

export type Issue198PluginCtor = new (app: unknown, manifest: unknown) => Issue198PluginLike;

// Builds a headless ICSPlugin backed by a single in-memory "vdir" calendar, so
// getEvents() runs its real vault-reading and event-assembly path without a
// network request or an Obsidian vault - against whichever constructor
// (source or compiled) the caller supplies.
function createPlugin(
  PluginCtor: Issue198PluginCtor,
  icsContent: string,
  formatOverrides: Record<string, unknown> = {},
): Issue198PluginLike {
  const file = { extension: 'ics', path: 'calendar.ics' };
  const app = {
    vault: {
      getFiles: () => [file],
      read: async () => icsContent,
    },
  };

  const plugin = new PluginCtor(app, {});
  plugin.data = baseSettings(formatOverrides);
  return plugin;
}

/**
 * Registers the full issue-198 getEvents() regression suite under the given
 * label, driving `PluginCtor` (either the TS-source class or a compiled
 * dist/main.js class). Call once per constructor to test.
 */
export function registerIssue198GetEventsSuite(label: string, PluginCtor: Issue198PluginCtor): void {
  describe(`issue #198 - getEvents() exposes startDateTime/endDateTime/endUtime/allDay [${label}]`, () => {
    describe('timed multi-day event', () => {
      const ics = icsWithEvent(
        'timed-multi-day',
        `DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260804T170000`,
        true,
      );

      it('carries all four new fields on the start day, alongside every existing field', async () => {
        const plugin = createPlugin(PluginCtor, ics, { showOngoing: true });
        const [event] = await plugin.getEvents('2026-08-03');

        expect(event).toBeDefined();
        expect(Object.getOwnPropertyNames(event)).toEqual(expect.arrayContaining([
          'utime', 'time', 'endTime', 'created', 'sequence', 'recurrent', 'lastModified',
          'icsName', 'summary', 'description', 'format', 'location', 'callUrl', 'callType',
          'extractedFields', 'organizer', 'attendees', 'eventType', 'uid', 'url',
          'startDateTime', 'endDateTime', 'endUtime', 'allDay',
        ]));

        expect(event.allDay).toBe(false);
        expect(event.startDateTime).toMatch(/[+-]\d{2}:\d{2}$/);
        expect(event.endDateTime).toMatch(/[+-]\d{2}:\d{2}$/);
        expect(moment.parseZone(event.startDateTime as string).toISOString()).toBe('2026-08-03T13:00:00.000Z');
        expect(moment.parseZone(event.endDateTime as string).toISOString()).toBe('2026-08-04T21:00:00.000Z');
        expect(Number(event.endUtime)).toBe(moment.utc('2026-08-04T21:00:00Z').unix());
        expect(Number(event.endUtime)).toBeGreaterThan(Number(event.utime));
      });

      it('still reports the same start/end fields on the ongoing (end) day', async () => {
        const plugin = createPlugin(PluginCtor, ics, { showOngoing: true });
        const [event] = await plugin.getEvents('2026-08-04');

        expect(event).toBeDefined();
        expect(event.allDay).toBe(false);
        expect(moment.parseZone(event.startDateTime as string).toISOString()).toBe('2026-08-03T13:00:00.000Z');
        expect(moment.parseZone(event.endDateTime as string).toISOString()).toBe('2026-08-04T21:00:00.000Z');
      });
    });

    describe('all-day multi-day event with exclusive DTEND', () => {
      // DTEND is exclusive for VALUE=DATE: this runs through Aug 4, ending at
      // the start of Aug 5.
      const ics = icsWithEvent('all-day-multi-day', `DTSTART;VALUE=DATE:20260803
DTEND;VALUE=DATE:20260805`);

      it('reports allDay true and an endDateTime at the start of the exclusive end day', async () => {
        const plugin = createPlugin(PluginCtor, ics, { showOngoing: true });
        const [event] = await plugin.getEvents('2026-08-03');

        expect(event).toBeDefined();
        expect(event.allDay).toBe(true);
        expect(event.startDateTime).toMatch(/^2026-08-03T00:00:00[+-]\d{2}:\d{2}$/);
        expect(event.endDateTime).toMatch(/^2026-08-05T00:00:00[+-]\d{2}:\d{2}$/);
        // endUtime is the exclusive boundary itself (start of Aug 5), not the
        // inclusive last displayed day (Aug 4).
        expect(Number(event.endUtime)).toBe(moment.parseZone(event.endDateTime as string).unix());
      });
    });

    describe('multi-day recurrence override replacing the master occurrence', () => {
      // Some providers emit the visible all-day event as a detached override
      // of a timed master occurrence. node-ical attaches that override to the
      // master under recurrences. The override must replace the master for
      // ongoing-day matching, just as it does on its start day.
      const ics = `${VCALENDAR_HEADER}BEGIN:VEVENT
UID:override-replaces-master
DTSTAMP:20260101T000000Z
DTSTART:20260803T000000
DTEND:20260914T235959
SUMMARY:Test Event
END:VEVENT
BEGIN:VEVENT
UID:override-replaces-master
RECURRENCE-ID;VALUE=DATE:20260803
DTSTAMP:20260101T000000Z
DTSTART;VALUE=DATE:20260803
DTEND;VALUE=DATE:20260915
SUMMARY:Test Event
END:VEVENT
END:VCALENDAR`;

      it('returns the all-day override, not the timed master, on an ongoing day', async () => {
        const plugin = createPlugin(PluginCtor, ics, { showOngoing: true });
        const events = await plugin.getEvents('2026-08-20');

        expect(events).toHaveLength(1);
        expect(events[0].uid).toBe('override-replaces-master');
        expect(events[0].allDay).toBe(true);
        expect(events[0].startDateTime).toMatch(/^2026-08-03T00:00:00[+-]\d{2}:\d{2}$/);
        expect(events[0].endDateTime).toMatch(/^2026-09-15T00:00:00[+-]\d{2}:\d{2}$/);
      });

      it('returns the replacement only once when a multi-date query includes its start and ongoing days', async () => {
        const plugin = createPlugin(PluginCtor, ics, { showOngoing: true });
        const events = await plugin.getEvents(
          '2026-08-03',
          '2026-08-20',
        );

        expect(events).toHaveLength(1);
        expect(events[0].allDay).toBe(true);
        expect(events[0].endDateTime).toMatch(/^2026-09-15T00:00:00[+-]\d{2}:\d{2}$/);
      });
    });

    describe('"Show ongoing" filtering enabled vs. disabled', () => {
      const ics = icsWithEvent('ongoing-toggle', `DTSTART;VALUE=DATE:20260803
DTEND;VALUE=DATE:20260805`);

      it('includes Aug 3 and Aug 4, but not the exclusive Aug 5 end date, when enabled', async () => {
        const plugin = createPlugin(PluginCtor, ics, { showOngoing: true });

        expect(await plugin.getEvents('2026-08-03')).toHaveLength(1);
        expect(await plugin.getEvents('2026-08-04')).toHaveLength(1);
        expect(await plugin.getEvents('2026-08-05')).toHaveLength(0);
      });

      it('includes only the start day when disabled', async () => {
        const plugin = createPlugin(PluginCtor, ics, { showOngoing: false });

        expect(await plugin.getEvents('2026-08-03')).toHaveLength(1);
        expect(await plugin.getEvents('2026-08-04')).toHaveLength(0);
      });

      it('exposes the same startDateTime/endDateTime/endUtime/allDay values regardless of the toggle', async () => {
        const enabledPlugin = createPlugin(PluginCtor, ics, { showOngoing: true });
        const disabledPlugin = createPlugin(PluginCtor, ics, { showOngoing: false });

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
        const plugin = createPlugin(PluginCtor, ics, { showOngoing: true });
        const [event] = await plugin.getEvents('2026-03-08');

        expect(event).toBeDefined();
        expect(event.allDay).toBe(false);

        expect(event.startDateTime).toMatch(/[+-]\d{2}:\d{2}$/);
        expect(event.endDateTime).toMatch(/[+-]\d{2}:\d{2}$/);

        const expectedStart = moment.utc('2026-03-08T05:00:00Z');
        const expectedEnd = moment.utc('2026-03-08T16:00:00Z');
        expect(moment.parseZone(event.startDateTime as string).toISOString()).toBe(expectedStart.toISOString());
        expect(moment.parseZone(event.endDateTime as string).toISOString()).toBe(expectedEnd.toISOString());
        expect(Number(event.utime)).toBe(expectedStart.unix());
        expect(Number(event.endUtime)).toBe(expectedEnd.unix());

        // 11 real hours elapsed across the spring-forward gap, not the 12
        // implied by the local 00:00-12:00 clock times.
        expect(Number(event.endUtime) - Number(event.utime)).toBe(11 * 3600);
      });
    });
  });
}
