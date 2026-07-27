import { DEFAULT_CALENDAR_FORMAT } from '../src/settings/ICSSettings';

// Deliberate product decisions about what a freshly added calendar does, pinned
// so they can't be flipped back by accident. See
// https://github.com/open-horizon-labs/obsidian-ics/issues/198 - a multi-day
// event appearing only on its start day was read as a bug, not as a setting.
describe('default calendar format', () => {
  it('shows ongoing events by default', () => {
    expect(DEFAULT_CALENDAR_FORMAT.showOngoing).toBe(true);
  });
});
