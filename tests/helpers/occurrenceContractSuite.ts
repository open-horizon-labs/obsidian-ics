// Public getEvents() contracts for occurrence identity, determinism and
// recurrence metadata, registered against either the TypeScript source class
// or the compiled dist/main.js class - the same two-constructor arrangement
// tests/helpers/issue198Suite.ts uses, and for the same reason: these are the
// contracts a Dataview/Templater script depends on, so the shipped bundle has
// to satisfy them, not just the source.
//
// Deliberately no imports from src/: the dist-artifact run must not be able to
// pass by accidentally re-testing TypeScript. The settings literals below
// mirror (without importing) DEFAULT_SETTINGS/DEFAULT_CALENDAR_FORMAT.

import { moment } from 'obsidian';

// A timed occurrence belongs to the host's day for that instant - the same day
// the daily note the query came from names. Deriving the query day from the
// instant keeps these contracts true in every host timezone instead of only in
// the fixture's one.
const hostDay = (instant: string): string => moment(instant).format('YYYY-MM-DD');
const hostDayAfter = (instant: string, days: number): string =>
  moment(instant).add(days, 'day').format('YYYY-MM-DD');

const VCALENDAR_HEADER = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
`;

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

function calendar(body: string, withTimezone = true): string {
  return `${VCALENDAR_HEADER}${withTimezone ? NEW_YORK_VTIMEZONE : ''}${body}
END:VCALENDAR`;
}

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
    format: { timeFormat: 'HH:mm', dataViewSyntax: false },
    calendars: {
      test: {
        icsUrl: 'calendar.ics',
        icsName: 'Test Calendar',
        calendarType: 'vdir',
        format: { ...BASE_CALENDAR_FORMAT, ...calendarFormatOverrides },
      },
    },
    fieldExtraction: { enabled: true, patterns: [] },
  };
}

export interface OccurrenceContractPluginLike {
  data: unknown;
  getEvents(...dates: string[]): Promise<Record<string, unknown>[]>;
}

export type OccurrenceContractPluginCtor = new (
  app: unknown,
  manifest: unknown,
) => OccurrenceContractPluginLike;

function createPlugin(
  PluginCtor: OccurrenceContractPluginCtor,
  icsContent: string,
  formatOverrides: Record<string, unknown> = {},
): OccurrenceContractPluginLike {
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
 * Registers the occurrence identity/determinism contract suite under the given
 * label, driving `PluginCtor` (either the TS-source class or a compiled
 * dist/main.js class). Call once per constructor to test.
 */
export function registerOccurrenceContractSuite(
  label: string,
  PluginCtor: OccurrenceContractPluginCtor,
): void {
  describe(`getEvents() occurrence contract [${label}]`, () => {
    describe('event identity', () => {
      it('returns both events when two distinct UIDs share summary, start and end', async () => {
        // Duplicate-looking but genuinely distinct events: two people booking
        // the same slot with the same title. Collapsing them loses one.
        const ics = calendar(`BEGIN:VEVENT
UID:uid-alpha
DTSTAMP:20260101T000000Z
SUMMARY:Standup
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T093000
END:VEVENT
BEGIN:VEVENT
UID:uid-beta
DTSTAMP:20260101T000000Z
SUMMARY:Standup
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T093000
END:VEVENT`);

        const events = await createPlugin(PluginCtor, ics)
          .getEvents(hostDay('2026-08-03T13:00:00.000Z'));

        expect(events).toHaveLength(2);
        expect(events.map(e => e.uid).sort()).toEqual(['uid-alpha', 'uid-beta']);
      });

      it('still collapses the same occurrence reaching the assembler twice', async () => {
        // One event spanning several days, with more than one of those days
        // queried, must not turn into several entries.
        const ics = calendar(`BEGIN:VEVENT
UID:single-occurrence
DTSTAMP:20260101T000000Z
SUMMARY:Multi-day
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260805T170000
END:VEVENT`);

        const startDay = hostDay('2026-08-03T13:00:00.000Z');
        const nextDay = hostDayAfter('2026-08-03T13:00:00.000Z', 1);
        const events = await createPlugin(PluginCtor, ics, { showOngoing: true })
          .getEvents(startDay, nextDay);

        expect(events).toHaveLength(1);
      });

      it('returns each occurrence of a series separately when several days are queried', async () => {
        const ics = calendar(`BEGIN:VEVENT
UID:weekly-series
DTSTAMP:20260101T000000Z
SUMMARY:Weekly
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T100000
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT`);

        const events = await createPlugin(PluginCtor, ics).getEvents(
          hostDay('2026-08-03T13:00:00.000Z'),
          hostDay('2026-08-10T13:00:00.000Z'),
          hostDay('2026-08-17T13:00:00.000Z'),
        );

        expect(events).toHaveLength(3);
        expect(new Set(events.map(e => e.startDateTime)).size).toBe(3);
      });
    });

    describe('determinism', () => {
      it('reports the same created/lastModified across calls when the event has neither', async () => {
        // Neither CREATED nor LAST-MODIFIED is present, so these fields have to
        // come from something stable in the feed (DTSTAMP) rather than the
        // current clock - otherwise every refresh reports a changed event.
        const ics = calendar(`BEGIN:VEVENT
UID:no-created
DTSTAMP:20260101T000000Z
SUMMARY:No created
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T093000
END:VEVENT`);

        const day = hostDay('2026-08-03T13:00:00.000Z');
        const [first] = await createPlugin(PluginCtor, ics).getEvents(day);
        const [second] = await createPlugin(PluginCtor, ics).getEvents(day);

        // Pinning the value, not just equality between two calls: two calls in
        // the same second would agree even if this were still reading the clock.
        const dtstamp = String(Date.UTC(2026, 0, 1, 0, 0, 0) / 1000);
        expect(first.created).toBe(dtstamp);
        expect(first.lastModified).toBe(dtstamp);
        expect(second.created).toBe(first.created);
        expect(second.lastModified).toBe(first.lastModified);
      });

      it('still prefers CREATED and LAST-MODIFIED when the event carries them', async () => {
        const ics = calendar(`BEGIN:VEVENT
UID:has-created
DTSTAMP:20260101T000000Z
CREATED:20250601T101500Z
LAST-MODIFIED:20250715T120000Z
SUMMARY:Has created
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260803T093000
END:VEVENT`);

        const [event] = await createPlugin(PluginCtor, ics)
          .getEvents(hostDay('2026-08-03T13:00:00.000Z'));

        expect(event.created).toBe(String(Date.UTC(2025, 5, 1, 10, 15, 0) / 1000));
        expect(event.lastModified).toBe(String(Date.UTC(2025, 6, 15, 12, 0, 0) / 1000));
      });

      it('returns identical results for two identical calls', async () => {
        const ics = calendar(`BEGIN:VEVENT
UID:stable
DTSTAMP:20260101T000000Z
SUMMARY:Stable
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260805T170000
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT`);

        const plugin = createPlugin(PluginCtor, ics, { showOngoing: true });
        const days = [
          hostDay('2026-08-03T13:00:00.000Z'),
          hostDayAfter('2026-08-10T13:00:00.000Z', 1),
        ];
        const first = await plugin.getEvents(...days);
        const second = await plugin.getEvents(...days);

        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      });
    });

    describe('recurrence metadata is a property of the occurrence, not the query', () => {
      const ics = calendar(`BEGIN:VEVENT
UID:multi-day-weekly
DTSTAMP:20260101T000000Z
SUMMARY:Multi-day weekly
DTSTART;TZID=America/New_York:20260803T090000
DTEND;TZID=America/New_York:20260805T170000
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT`);

      it('marks an ongoing day of a later occurrence as a recurring occurrence', async () => {
        const [event] = await createPlugin(PluginCtor, ics, { showOngoing: true })
          .getEvents(hostDayAfter('2026-08-10T13:00:00.000Z', 1));

        expect(event).toBeDefined();
        expect(event.recurrent).toBe(true);
        expect(event.eventType).toBe('recurring');
      });

      it('reports identical fields whether the start day or an ongoing day is queried', async () => {
        const plugin = createPlugin(PluginCtor, ics, { showOngoing: true });

        const [fromStartDay] = await plugin.getEvents(hostDay('2026-08-10T13:00:00.000Z'));
        const [fromOngoingDay] = await plugin.getEvents(
          hostDayAfter('2026-08-10T13:00:00.000Z', 1));

        expect(fromOngoingDay.startDateTime).toBe(fromStartDay.startDateTime);
        expect(fromOngoingDay.endDateTime).toBe(fromStartDay.endDateTime);
        expect(fromOngoingDay.utime).toBe(fromStartDay.utime);
        expect(fromOngoingDay.endUtime).toBe(fromStartDay.endUtime);
        expect(fromOngoingDay.eventType).toBe(fromStartDay.eventType);
        expect(fromOngoingDay.recurrent).toBe(fromStartDay.recurrent);
      });
    });

    describe('all-day events re-exported as midnight-to-23:59:59 timed events', () => {
      // Some exporters re-encode a VALUE=DATE range as a timed one pinned to
      // the first and last moment of the day in a named timezone. The Berlin
      // fixture below is byte-for-byte the shape reported for a six-week
      // holiday that had originally been DTSTART;VALUE=DATE:20260803 /
      // DTEND;VALUE=DATE:20260915. Read literally it is a pair of instants, so
      // it loses allDay, ends at 23:59:59 instead of the exclusive next
      // midnight, and slides a day for hosts far from Berlin.
      const BERLIN_REEXPORT = calendar(`BEGIN:VEVENT
UID:berlin-reexport
DTSTAMP:20260101T000000Z
SUMMARY:Sommerferien
DTSTART;TZID=Europe/Berlin:20260803T000000
DTEND;TZID=Europe/Berlin:20260914T235959
END:VEVENT`, false);

      it('reports it as an all-day event spanning the original dates', async () => {
        const [event] = await createPlugin(PluginCtor, BERLIN_REEXPORT, { showOngoing: true })
          .getEvents('2026-08-03');

        expect(event).toBeDefined();
        expect(event.allDay).toBe(true);
        expect(event.startDateTime).toMatch(/^2026-08-03T00:00:00[+-]\d{2}:\d{2}$/);
        // Exclusive DTEND, exactly as the VALUE=DATE original had it.
        expect(event.endDateTime).toMatch(/^2026-09-15T00:00:00[+-]\d{2}:\d{2}$/);
      });

      it('keeps the same calendar dates whatever timezone the host is in', async () => {
        const plugin = createPlugin(PluginCtor, BERLIN_REEXPORT, { showOngoing: true });

        expect(await plugin.getEvents('2026-08-03')).toHaveLength(1);
        expect(await plugin.getEvents('2026-08-20')).toHaveLength(1);
        expect(await plugin.getEvents('2026-09-14')).toHaveLength(1);
        // The exclusive end day is not part of the event.
        expect(await plugin.getEvents('2026-09-15')).toHaveLength(0);
        expect(await plugin.getEvents('2026-08-02')).toHaveLength(0);
      });

      it('leaves a range whose start and end name different timezones alone', async () => {
        // 22:59:59 in London is 23:59:59 in Berlin, so judging the end by the
        // start's zone would misread this as an all-day range.
        const ics = calendar(`BEGIN:VEVENT
UID:mismatched-zones
DTSTAMP:20260101T000000Z
SUMMARY:Mismatched zones
DTSTART;TZID=Europe/Berlin:20260803T000000
DTEND;TZID=Europe/London:20260914T225959
END:VEVENT`, false);

        const [event] = await createPlugin(PluginCtor, ics, { showOngoing: true })
          .getEvents(hostDay('2026-08-02T22:00:00.000Z'));

        expect(event).toBeDefined();
        expect(event.allDay).toBe(false);
      });

      it('reports every occurrence of a DST-crossing series as all-day', async () => {
        // Europe/Berlin leaves summer time inside the first occurrence, so the
        // expanded occurrences no longer end on the source's 23:59:59 wall
        // clock. They are still whole calendar days.
        const ics = calendar(`BEGIN:VEVENT
UID:berlin-reexport-dst
DTSTAMP:20260101T000000Z
SUMMARY:Herbstferien
DTSTART;TZID=Europe/Berlin:20261024T000000
DTEND;TZID=Europe/Berlin:20261025T235959
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT`, false);

        const plugin = createPlugin(PluginCtor, ics, { showOngoing: true });

        for (const day of ['2026-10-31', '2026-11-01', '2026-11-07', '2026-11-08']) {
          const events = await plugin.getEvents(day);
          expect(events).toHaveLength(1);
          expect(events[0].allDay).toBe(true);
        }

        for (const day of ['2026-10-30', '2026-11-02', '2026-11-09']) {
          expect(await plugin.getEvents(day)).toHaveLength(0);
        }
      });

      it('leaves a timed event starting a second after midnight alone', async () => {
        const ics = calendar(`BEGIN:VEVENT
UID:one-second-past
DTSTAMP:20260101T000000Z
SUMMARY:Not all day
DTSTART;TZID=Europe/Berlin:20260803T000001
DTEND;TZID=Europe/Berlin:20260914T235959
END:VEVENT`, false);

        const [event] = await createPlugin(PluginCtor, ics, { showOngoing: true })
          .getEvents(hostDay('2026-08-02T22:00:01.000Z'));

        expect(event).toBeDefined();
        expect(event.allDay).toBe(false);
      });

      it('leaves a timed event ending a second before the end of day alone', async () => {
        const ics = calendar(`BEGIN:VEVENT
UID:one-second-short
DTSTAMP:20260101T000000Z
SUMMARY:Not all day
DTSTART;TZID=Europe/Berlin:20260803T000000
DTEND;TZID=Europe/Berlin:20260914T235958
END:VEVENT`, false);

        const [event] = await createPlugin(PluginCtor, ics, { showOngoing: true })
          .getEvents(hostDay('2026-08-02T22:00:00.000Z'));

        expect(event).toBeDefined();
        expect(event.allDay).toBe(false);
      });
    });

    describe('queried days are a set, not a range', () => {
      it('omits a one-off that falls between two sparse query days', async () => {
        const ics = calendar(`BEGIN:VEVENT
UID:in-between
DTSTAMP:20260101T000000Z
SUMMARY:In between
DTSTART;TZID=America/New_York:20260810T120000
DTEND;TZID=America/New_York:20260810T130000
END:VEVENT`);

        const plugin = createPlugin(PluginCtor, ics);

        const before = hostDayAfter('2026-08-10T16:00:00.000Z', -7);
        const after = hostDayAfter('2026-08-10T16:00:00.000Z', 10);

        expect(await plugin.getEvents(before, after)).toHaveLength(0);
        expect(await plugin.getEvents(hostDay('2026-08-10T16:00:00.000Z'))).toHaveLength(1);
      });
    });
  });
}
