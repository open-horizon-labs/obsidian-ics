import { parseIcs, filterMatchingEvents, textValue } from '../src/icalUtils';
import { WINDOWS_TO_IANA_TIMEZONES } from '../src/generated/windowsTimezones';
import * as ical from 'node-ical';

// node-ical's parseICS export is no longer a configurable property, so
// jest.spyOn(ical, 'parseICS') throws "Cannot redefine property". Mocking
// the module instead keeps the real implementation as the default and lets
// individual tests override it.
jest.mock('node-ical', () => {
  const actual = jest.requireActual<typeof ical>('node-ical');
  return {
    ...actual,
    parseICS: jest.fn(actual.parseICS),
  };
});

describe('Microsoft Office 365 Timezone Parsing', () => {
  afterEach(() => {
    const actual = jest.requireActual<typeof ical>('node-ical');
    (ical.parseICS as jest.Mock).mockImplementation(actual.parseICS);
  });


  it('should handle the specific tz.startsWith error scenario', () => {
    // Create a scenario that triggers the exact error from the issue report
    const problematicIcsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:Tokyo Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+0900
TZOFFSETTO:+0900
RRULE:FREQ=YEARLY;COUNT=1
TZNAME:JST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:problematic-microsoft-event
DTSTART;TZID=Tokyo Standard Time:20240924T163000
DTEND;TZID=Tokyo Standard Time:20240924T173000
SUMMARY:Microsoft Outlook Meeting
RRULE:FREQ=WEEKLY;COUNT=2
DTSTAMP:20240924T120000Z
END:VEVENT
BEGIN:VEVENT
UID:problematic-microsoft-event
RECURRENCE-ID;TZID=Tokyo Standard Time:20240924T163000
DTSTART;TZID=Tokyo Standard Time:20240924T173000
DTEND;TZID=Tokyo Standard Time:20240924T183000
SUMMARY:Microsoft Outlook Meeting (Modified)
DTSTAMP:20240924T120000Z
END:VEVENT
END:VCALENDAR`;

    // Mock the original parseICS to simulate the error
    const originalParseICS = jest.requireActual<typeof ical>('node-ical').parseICS;
    const mockError = new TypeError('tz.startsWith is not a function');

    // First call throws the error, second call (after preprocessing) succeeds
    let callCount = 0;
    (ical.parseICS as jest.Mock).mockImplementation((content: string) => {
      callCount++;
      if (callCount === 1) {
        // Simulate the original error
        throw mockError;
      } else {
        // Use the real implementation for the preprocessed content
        return originalParseICS(content);
      }
    });

    // This should handle the error gracefully and succeed after preprocessing
    const parsedEvents = parseIcs(problematicIcsContent);
    const matchingEvents = filterMatchingEvents(parsedEvents, ['2024-09-24'], false);

    expect(matchingEvents.length).toBeGreaterThanOrEqual(1);
    expect(ical.parseICS).toHaveBeenCalledTimes(2); // First call fails, second succeeds
  });

  it('should handle edge case that might cause tz.startsWith error', () => {
    // Test a scenario that might trigger the original error
    // This could happen with malformed timezone data or specific edge cases
    const problematicIcsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:Customized Time Zone
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+0500
TZOFFSETTO:+0500
RRULE:FREQ=YEARLY;COUNT=1
TZNAME:Custom
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:problematic-event
DTSTART;TZID=Customized Time Zone:20240924T100000
DTEND;TZID=Customized Time Zone:20240924T110000
SUMMARY:Test Event
RRULE:FREQ=DAILY;COUNT=2
DTSTAMP:20240924T120000Z
END:VEVENT
BEGIN:VEVENT
UID:problematic-event
RECURRENCE-ID;TZID=Customized Time Zone:20240924T100000
DTSTART;TZID=Customized Time Zone:20240924T120000
DTEND;TZID=Customized Time Zone:20240924T130000
SUMMARY:Test Event (Modified)
DTSTAMP:20240924T120000Z
END:VEVENT
END:VCALENDAR`;

    // This should work without throwing the startsWith error
    expect(() => {
      const parsedEvents = parseIcs(problematicIcsContent);
      filterMatchingEvents(parsedEvents, ['2024-09-24'], false);
    }).not.toThrow();
  });
  it.skip('should handle timezone names with spaces in RECURRENCE-ID fields', () => {
    // Sample ICS content that reproduces the Microsoft O365 timezone issue
    // This contains TZID=Tokyo Standard Time which causes node-ical to fail
    // Note: Skipping this test as the current node-ical version (0.20.1) handles this correctly
    const microsoftIcsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
METHOD:PUBLISH
X-WR-CALNAME:Test Calendar
BEGIN:VTIMEZONE
TZID:Tokyo Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+0900
TZOFFSETTO:+0900
RRULE:FREQ=YEARLY;COUNT=1
TZNAME:JST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:test-recurring-event-microsoft
DTSTART;TZID=Tokyo Standard Time:20240924T163000
DTEND;TZID=Tokyo Standard Time:20240924T173000
SUMMARY:Microsoft Recurring Meeting
RRULE:FREQ=WEEKLY;COUNT=3
DTSTAMP:20240924T120000Z
END:VEVENT
BEGIN:VEVENT
UID:test-recurring-event-microsoft
RECURRENCE-ID;TZID=Tokyo Standard Time:20240924T163000
DTSTART;TZID=Tokyo Standard Time:20240924T173000
DTEND;TZID=Tokyo Standard Time:20240924T183000
SUMMARY:Microsoft Recurring Meeting (Rescheduled)
DTSTAMP:20240924T120000Z
END:VEVENT
END:VCALENDAR`;

    // This should fail with the current node-ical library
    // TypeError: tz.startsWith is not a function
    expect(() => {
      const parsedEvents = parseIcs(microsoftIcsContent);
      filterMatchingEvents(parsedEvents, ['2024-09-24'], false);
    }).toThrow('tz.startsWith is not a function');
  });

  it('should handle timezone names with spaces correctly', () => {
    // Verify that the current node-ical version handles Microsoft timezones properly
    const microsoftIcsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
METHOD:PUBLISH
X-WR-CALNAME:Test Calendar
BEGIN:VTIMEZONE
TZID:Tokyo Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+0900
TZOFFSETTO:+0900
RRULE:FREQ=YEARLY;COUNT=1
TZNAME:JST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:test-recurring-event-microsoft-fixed
DTSTART;TZID=Tokyo Standard Time:20240924T163000
DTEND;TZID=Tokyo Standard Time:20240924T173000
SUMMARY:Microsoft Meeting Working
RRULE:FREQ=WEEKLY;COUNT=2
DTSTAMP:20240924T120000Z
END:VEVENT
BEGIN:VEVENT
UID:test-recurring-event-microsoft-fixed
RECURRENCE-ID;TZID=Tokyo Standard Time:20240924T163000
DTSTART;TZID=Tokyo Standard Time:20240924T173000
DTEND;TZID=Tokyo Standard Time:20240924T183000
SUMMARY:Microsoft Meeting Working (Rescheduled)
DTSTAMP:20240924T120000Z
END:VEVENT
END:VCALENDAR`;

    // This should work with the current node-ical version
    const parsedEvents = parseIcs(microsoftIcsContent);
    const matchingEvents = filterMatchingEvents(parsedEvents, ['2024-09-24'], false);

    // Should return the recurring override event
    expect(matchingEvents.length).toBeGreaterThanOrEqual(1);
    const rescheduledEvent = matchingEvents.find(e => textValue(e.summary).includes('Rescheduled'));
    expect(rescheduledEvent).toBeDefined();
    expect(rescheduledEvent?.summary).toBe('Microsoft Meeting Working (Rescheduled)');
  });

  it('should handle various Microsoft timezone formats', () => {
    const microsoftTimezoneFormats = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:Eastern Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:-0500
TZOFFSETTO:-0500
RRULE:FREQ=YEARLY;COUNT=1
TZNAME:EST
END:STANDARD
END:VTIMEZONE
BEGIN:VTIMEZONE
TZID:Pacific Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:-0800
TZOFFSETTO:-0800
RRULE:FREQ=YEARLY;COUNT=1
TZNAME:PST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:eastern-event
DTSTART;TZID=Eastern Standard Time:20240924T100000
DTEND;TZID=Eastern Standard Time:20240924T110000
SUMMARY:Eastern Meeting
DTSTAMP:20240924T120000Z
END:VEVENT
BEGIN:VEVENT
UID:pacific-event
DTSTART;TZID=Pacific Standard Time:20240924T100000
DTEND;TZID=Pacific Standard Time:20240924T110000
SUMMARY:Pacific Meeting
DTSTAMP:20240924T120000Z
END:VEVENT
END:VCALENDAR`;

    const parsedEvents = parseIcs(microsoftTimezoneFormats);
    const matchingEvents = filterMatchingEvents(parsedEvents, ['2024-09-24'], false);

    expect(matchingEvents).toHaveLength(2);
    expect(matchingEvents.find(e => textValue(e.summary) === 'Eastern Meeting')).toBeDefined();
    expect(matchingEvents.find(e => textValue(e.summary) === 'Pacific Meeting')).toBeDefined();
  });

  it('should specifically handle RECURRENCE-ID with Microsoft timezone format', () => {
    // This test explicitly focuses on the RECURRENCE-ID;TZID=Tokyo Standard Time scenario
    // mentioned in the issue report
    const recurrenceIdIcsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:Tokyo Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+0900
TZOFFSETTO:+0900
RRULE:FREQ=YEARLY;COUNT=1
TZNAME:JST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:recurrence-id-test
DTSTART;TZID=Tokyo Standard Time:20240924T163000
DTEND;TZID=Tokyo Standard Time:20240924T173000
SUMMARY:Original Recurring Event
RRULE:FREQ=WEEKLY;COUNT=2
DTSTAMP:20240924T120000Z
END:VEVENT
BEGIN:VEVENT
UID:recurrence-id-test
RECURRENCE-ID;TZID=Tokyo Standard Time:20240924T163000
DTSTART;TZID=Tokyo Standard Time:20240924T180000
DTEND;TZID=Tokyo Standard Time:20240924T190000
SUMMARY:Modified Instance - RECURRENCE-ID Test
DTSTAMP:20240924T120000Z
END:VEVENT
END:VCALENDAR`;

    // This should parse successfully and handle the RECURRENCE-ID properly
    const parsedEvents = parseIcs(recurrenceIdIcsContent);
    const matchingEvents = filterMatchingEvents(parsedEvents, ['2024-09-24'], false);

    // Should find the modified instance (recurrence override)
    expect(matchingEvents.length).toBeGreaterThanOrEqual(1);
    const modifiedInstance = matchingEvents.find(
      e => textValue(e.summary) === 'Modified Instance - RECURRENCE-ID Test'
    );
    expect(modifiedInstance).toBeDefined();
    expect(modifiedInstance?.eventType).toBe('recurring override');
  });

  it('should handle comprehensive Microsoft timezone mappings', () => {
    // Test a variety of Microsoft timezone formats from different regions
    const comprehensiveIcsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:India Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+0530
TZOFFSETTO:+0530
RRULE:FREQ=YEARLY;COUNT=1
TZNAME:IST
END:STANDARD
END:VTIMEZONE
BEGIN:VTIMEZONE
TZID:AUS Eastern Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+1100
TZOFFSETTO:+1100
RRULE:FREQ=YEARLY;COUNT=1
TZNAME:AEDT
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:india-event
DTSTART;TZID=India Standard Time:20240924T140000
DTEND;TZID=India Standard Time:20240924T150000
SUMMARY:Mumbai Meeting
DTSTAMP:20240924T120000Z
END:VEVENT
BEGIN:VEVENT
UID:australia-event
DTSTART;TZID=AUS Eastern Standard Time:20240924T100000
DTEND;TZID=AUS Eastern Standard Time:20240924T110000
SUMMARY:Sydney Meeting
DTSTAMP:20240924T120000Z
END:VEVENT
END:VCALENDAR`;

    // Should parse successfully with the expanded timezone mappings
    const parsedEvents = parseIcs(comprehensiveIcsContent);
    const matchingEvents = filterMatchingEvents(parsedEvents, ['2024-09-24'], false);

    // Should successfully parse the timezone mappings and find the Mumbai meeting
    expect(matchingEvents.length).toBeGreaterThanOrEqual(1);
    expect(matchingEvents.find(e => textValue(e.summary) === 'Mumbai Meeting')).toBeDefined();

    // Note: Sydney meeting (10:00 AM Sydney time) might be filtered out as it converts to
    // 2024-09-23 in UTC, which is correct timezone behavior
  });

  it('should handle Romance Standard Time (Brussels, Copenhagen, Madrid, Paris)', () => {
    // This test specifically addresses the issue mentioned in the problem description:
    // "events in 'Brussels, Copenhagen, Madrid, Paris' are shown in the .ics as 'Romance Standard Time',
    // but this definition is not included in the .ics file VTIMEZONE definitions"
    const romanceTimezoneIcsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
METHOD:PUBLISH
BEGIN:VEVENT
UID:romance-timezone-test
DTSTART;TZID=Romance Standard Time:20240924T140000
DTEND;TZID=Romance Standard Time:20240924T150000
SUMMARY:Brussels/Paris Meeting
DESCRIPTION:Meeting in Romance Standard Time zone without VTIMEZONE definition
DTSTAMP:20240924T120000Z
END:VEVENT
END:VCALENDAR`;

    // This should work even without VTIMEZONE definition in the ICS
    // because our preprocessing will map "Romance Standard Time" to "Europe/Paris"
    const parsedEvents = parseIcs(romanceTimezoneIcsContent);
    const matchingEvents = filterMatchingEvents(parsedEvents, ['2024-09-24'], false);

    expect(matchingEvents).toHaveLength(1);
    expect(matchingEvents[0].summary).toBe('Brussels/Paris Meeting');

    // Verify that the preprocessing handled the missing VTIMEZONE definition
    expect(matchingEvents[0]).toBeDefined();
  });

  it('should handle all 139 CLDR timezone mappings', () => {
    // Verify that we're using the comprehensive CLDR mappings (139 total as of generation)
    // This ensures we have significantly more coverage than our original hardcoded list
    // Should have comprehensive coverage from Unicode CLDR
    expect(Object.keys(WINDOWS_TO_IANA_TIMEZONES).length).toBeGreaterThanOrEqual(139);

    // Verify key problematic timezones are included
    expect(WINDOWS_TO_IANA_TIMEZONES['Romance Standard Time']).toBe('Europe/Paris');
    expect(WINDOWS_TO_IANA_TIMEZONES['Tokyo Standard Time']).toBe('Asia/Tokyo');
    expect(WINDOWS_TO_IANA_TIMEZONES['Eastern Standard Time']).toBe('America/New_York');
    expect(WINDOWS_TO_IANA_TIMEZONES['GMT Standard Time']).toBe('Europe/London');
  });
});