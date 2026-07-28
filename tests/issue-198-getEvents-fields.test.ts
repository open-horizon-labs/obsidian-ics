import ICSPlugin from '../src/main';
import { registerIssue198GetEventsSuite, withNewYorkTimeZone, type Issue198PluginCtor } from './helpers/issue198Suite';

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
//
// This suite drives the TypeScript source directly. The same cases also run
// against the actual compiled dist/main.js release artifact in
// tests/issue-198-dist-artifact.test.ts (npm run test:dist-artifact) - see
// that file for why source-level coverage alone isn't sufficient for this
// issue: the bug report was that the *shipped build*, not the source, was
// missing these fields.

// eventDateFields() formats startDateTime/endDateTime in the process's local
// timezone (moment(date).format() with no explicit zone), not the event's
// source TZID - so the offset in the assertions only means what it claims to
// mean if this suite runs as America/New_York. Restored after the suite so it
// can't leak into other test files sharing this Jest worker.
let tz: { restore(): void };
beforeAll(() => {
  tz = withNewYorkTimeZone();
});
afterAll(() => {
  tz.restore();
});

// ICSPlugin's real constructor is typed against App/PluginManifest, narrower
// than Issue198PluginCtor's deliberately loose (unknown, unknown) signature -
// this cast just bridges that, it doesn't change what's actually constructed.
registerIssue198GetEventsSuite('source: src/main.ts', ICSPlugin as unknown as Issue198PluginCtor);
