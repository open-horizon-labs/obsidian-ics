import { readFileSync } from 'fs';
import { join } from 'path';
import { parseIcs, filterMatchingEvents } from '../src/icalUtils';

// Regression coverage for https://github.com/open-horizon-labs/obsidian-ics/issues/168
// Real anonymized-by-reporter ICS files from a Yahoo and a Microsoft 365 calendar that
// used to crash with "RangeError: Invalid time zone specified: undefined" and
// "TypeError: a.status.toUpperCase is not a function". Both now parse and filter cleanly.
describe('issue #168 - Yahoo and Microsoft 365 calendars', () => {
  it('parses and filters yahoo.ics without throwing', () => {
    const ics = readFileSync(join(__dirname, 'fixtures/issue-168-yahoo.ics'), 'utf8');
    const events = parseIcs(ics);
    expect(events.length).toBeGreaterThan(0);
    for (const d of ['2024-06-15', '2025-01-01', '2025-06-15', '2026-01-01', '2026-06-15']) {
      expect(() => filterMatchingEvents(events, [d], true)).not.toThrow();
    }
  }, 20000);

  it('parses and filters o365.ics without throwing', () => {
    const ics = readFileSync(join(__dirname, 'fixtures/issue-168-o365.ics'), 'utf8');
    const events = parseIcs(ics);
    expect(events.length).toBeGreaterThan(0);
    for (const d of ['2024-06-15', '2025-01-01', '2025-06-15', '2026-01-01', '2026-06-15']) {
      expect(() => filterMatchingEvents(events, [d], true)).not.toThrow();
    }
  }, 20000);
});
