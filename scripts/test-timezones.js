#!/usr/bin/env node
'use strict';

// Runs the full test suite once per host timezone.
//
// Occurrence selection has two temporal models that only differ outside the
// timezone a test happens to be written in: VALUE=DATE values are floating
// calendar dates whose label must never move, and DATE-TIME values are instants
// attributed to the host's local day. A suite run only in the author's zone
// can't tell those apart - which is how an all-day recurring event came to be
// silently shifted a day for every user at a positive UTC offset while the
// suite stayed green.
//
// The zone list is deliberately awkward: both extremes of the offset range, a
// zone whose local midnight is on the other side of UTC midnight from the
// fixtures, and three offsets that aren't whole hours.
//
// Every test that deals in DATE-TIME values must derive its expected calendar
// day from the represented instant. VALUE=DATE expectations remain fixed.

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Kathmandu',    // +05:45
  'Australia/Eucla',   // +08:45
  'Pacific/Chatham',   // +12:45/+13:45
  'Pacific/Kiritimati', // +14, the eastern extreme
  'Pacific/Midway',    // -11, the western extreme
];

const projectRoot = path.resolve(__dirname, '..');
const failures = [];

for (const timezone of TIMEZONES) {
  process.stdout.write(`\n=== TZ=${timezone} ===\n`);

  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, 'node_modules', '.bin', 'jest'), '--runInBand', '--silent'],
    {
      cwd: projectRoot,
      env: { ...process.env, TZ: timezone },
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    failures.push(timezone);
  }
}

if (failures.length > 0) {
  process.stdout.write(`\nFAILED in ${failures.length} timezone(s): ${failures.join(', ')}\n`);
  process.exit(1);
}

process.stdout.write(`\nAll ${TIMEZONES.length} timezones passed.\n`);
