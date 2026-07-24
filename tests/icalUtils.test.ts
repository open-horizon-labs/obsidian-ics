import { parseIcs, filterMatchingEvents, extractFields } from '../src/icalUtils';
import { DEFAULT_FIELD_EXTRACTION_PATTERNS } from '../src/settings/ICSSettings';

describe('icalUtils', () => {
  describe('parseIcs', () => {
    it('should parse basic ICS content', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
SUMMARY:Test Event
DTSTART:20250301T120000Z
DTEND:20250301T130000Z
UID:test-event
END:VEVENT
END:VCALENDAR`;

      const events = parseIcs(icsContent);
      expect(events).toHaveLength(1);
      expect(events[0].summary).toBe('Test Event');
    });

    it('should parse multiple events', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
SUMMARY:Event 1
DTSTART:20250301T120000Z
DTEND:20250301T130000Z
UID:event-1
END:VEVENT
BEGIN:VEVENT
SUMMARY:Event 2
DTSTART:20250302T120000Z
DTEND:20250302T130000Z
UID:event-2
END:VEVENT
END:VCALENDAR`;

      const events = parseIcs(icsContent);
      expect(events).toHaveLength(2);
      expect(events[0].summary).toBe('Event 1');
      expect(events[1].summary).toBe('Event 2');
    });
  });

  describe('filterMatchingEvents', () => {
    it('should filter non-recurring events by date', () => {
      const events = [{
        type: 'VEVENT' as const,
        summary: 'Test Event',
        start: new Date('2025-03-01T12:00:00Z'),
        end: new Date('2025-03-01T13:00:00Z'),
        uid: 'test-event',
        dtstamp: new Date('2025-03-01T00:00:00Z'),
        datetype: 'date-time' as const
      }];

      const matching = filterMatchingEvents(events, ['2025-03-01'], false);
      expect(matching).toHaveLength(1);
      expect(matching[0].summary).toBe('Test Event');

      const notMatching = filterMatchingEvents(events, ['2025-03-02'], false);
      expect(notMatching).toHaveLength(0);
    });

    it('should handle ongoing events when showOngoing is true', () => {
      const events = [{
        type: 'VEVENT' as const,
        summary: 'Multi-day Event',
        start: new Date('2025-03-01T12:00:00Z'),
        end: new Date('2025-03-03T13:00:00Z'),
        uid: 'multi-day-event',
        dtstamp: new Date('2025-03-01T00:00:00Z'),
        datetype: 'date-time' as const
      }];

      // Should not match without showOngoing
      const withoutOngoing = filterMatchingEvents(events, ['2025-03-02'], false);
      expect(withoutOngoing).toHaveLength(0);

      // Should match with showOngoing
      const withOngoing = filterMatchingEvents(events, ['2025-03-02'], true);
      expect(withOngoing).toHaveLength(1);
      expect(withOngoing[0].summary).toBe('Multi-day Event');
    });

    it('should show multi-day events on all spanned days only when showOngoing is enabled', () => {
      const events = [{
        type: 'VEVENT' as const,
        summary: 'Spanning Event',
        start: new Date('2025-10-09T09:00:00Z'),
        end: new Date('2025-10-11T17:00:00Z'),
        uid: 'spanning-event-uid',
        dtstamp: new Date('2025-10-01T00:00:00Z'),
        datetype: 'date-time' as const
      }];

      const dates = ['2025-10-09', '2025-10-10', '2025-10-11'];

      // With showOngoing OFF: only the start date should include the event
      const eventsOnDatesWithOngoingOff = dates.map(date => filterMatchingEvents(events, [date], false));
      expect(eventsOnDatesWithOngoingOff[0]).toHaveLength(1); // 2025-10-09 (start)
      expect(eventsOnDatesWithOngoingOff[1]).toHaveLength(0); // 2025-10-10 (middle)
      expect(eventsOnDatesWithOngoingOff[2]).toHaveLength(0); // 2025-10-11 (end)

      // With showOngoing ON: all dates from start to end should include the event
      const eventsOnDatesWithOngoingOn = dates.map(date => filterMatchingEvents(events, [date], true));
      expect(eventsOnDatesWithOngoingOn[0]).toHaveLength(1); // 2025-10-09 (start)
      expect(eventsOnDatesWithOngoingOn[1]).toHaveLength(1); // 2025-10-10 (middle)
      expect(eventsOnDatesWithOngoingOn[2]).toHaveLength(1); // 2025-10-11 (end)

      // Sanity: verify correct event is returned
      eventsOnDatesWithOngoingOn.forEach((res) => {
        expect(res[0].summary).toBe('Spanning Event');
      });
    });

    it('should skip cancelled events', () => {
      const events = [{
        type: 'VEVENT' as const,
        summary: 'Cancelled Event',
        start: new Date('2025-03-01T12:00:00Z'),
        end: new Date('2025-03-01T13:00:00Z'),
        status: 'CANCELLED' as const,
        uid: 'cancelled-event',
        dtstamp: new Date('2025-03-01T00:00:00Z'),
        datetype: 'date-time' as const
      }];

      const matching = filterMatchingEvents(events, ['2025-03-01'], false);
      expect(matching).toHaveLength(0);
    });
  });

  describe('extractFields', () => {
    it('should extract Video Call URLs to array', () => {
      const event = {
        'GOOGLE-CONFERENCE': 'https://meet.google.com/abc-defg-hij'
      };

      const extractedFields = extractFields(event, DEFAULT_FIELD_EXTRACTION_PATTERNS);
      expect(extractedFields['Video Call URLs']).toEqual(['https://meet.google.com/abc-defg-hij']);
    });

    it('should extract multiple video call URLs', () => {
      const event = {
        location: 'https://zoom.us/j/123456789',
        description: 'Backup meeting: https://meet.google.com/backup-link'
      };

      const patterns = [
        ...DEFAULT_FIELD_EXTRACTION_PATTERNS,
        {
          name: "Google Meet Backup",
          pattern: "https://meet\\.google\\.com/[a-zA-Z0-9-]+",
          matchType: "regex" as const,
          priority: 5,
          extractedFieldName: "Video Call URLs"
        }
      ];

      const extractedFields = extractFields(event, patterns);
      expect(extractedFields['Video Call URLs']).toContain('https://zoom.us/j/123456789');
      expect(extractedFields['Video Call URLs']).toContain('https://meet.google.com/backup-link');
      expect(extractedFields['Video Call URLs']).toHaveLength(2);
    });

    it('should extract different field types', () => {
      const event = {
        description: 'Meeting ID: 12345, Phone: +1-555-123-4567, https://zoom.us/j/123456789'
      };

      const patterns = [
        {
          name: "Meeting ID",
          pattern: "Meeting ID: (\\d+)",
          matchType: "regex" as const,
          priority: 1,
          extractedFieldName: "Meeting ID"
        },
        {
          name: "Phone Number",
          pattern: "\\+1-\\d{3}-\\d{3}-\\d{4}",
          matchType: "regex" as const,
          priority: 2,
          extractedFieldName: "Phone Number"
        },
        {
          name: "Zoom",
          pattern: "zoom.us",
          matchType: "contains" as const,
          priority: 3,
          extractedFieldName: "Video Call URLs"
        }
      ];

      const extractedFields = extractFields(event, patterns);
      expect(extractedFields['Meeting ID']).toEqual(['12345']);
      expect(extractedFields['Phone Number']).toEqual(['+1-555-123-4567']);
      expect(extractedFields['Video Call URLs']).toContain('https://zoom.us/j/123456789');
    });

    it('should return empty object when no patterns provided', () => {
      const event = {};

      const extractedFields = extractFields(event, []);
      expect(extractedFields).toEqual({});
    });

    it('should return empty object when no matches found', () => {
      const event = {};

      const extractedFields = extractFields(event, DEFAULT_FIELD_EXTRACTION_PATTERNS);
      expect(extractedFields).toEqual({});
    });
  });

  describe('Timezone and Recurrence Integration', () => {
    it('should handle complex recurring patterns with timezones', () => {
      // This test specifically targets the logic that was changed in the problematic commit
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VTIMEZONE
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
BEGIN:VEVENT
SUMMARY:Timezone Test
DTSTART;TZID=America/New_York:20250301T090000
DTEND;TZID=America/New_York:20250301T100000
RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=SA
EXDATE;TZID=America/New_York:20250315T090000
UID:timezone-test
END:VEVENT
END:VCALENDAR`;

      const events = parseIcs(icsContent);
      expect(events).toHaveLength(1);

      // Test multiple dates to ensure recurring logic works correctly
      const testDates = [
        '2025-03-01', // Original event
        '2025-03-08', // First recurrence
        '2025-03-15', // Excluded date
        '2025-03-22'  // Should appear
      ];

      const results = testDates.map(date => filterMatchingEvents(events, [date], false));

      expect(results[0]).toHaveLength(1); // Original
      expect(results[1]).toHaveLength(1); // First recurrence
      expect(results[2]).toHaveLength(0); // Excluded
      expect(results[3]).toHaveLength(1); // Should appear
    });
  });


});
