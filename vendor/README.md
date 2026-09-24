# Temporary node-ical package

`node-ical-0.27.2-pr559-97c341a.tgz` is an npm package built from
[muness/node-ical commit 97c341a9d3977d23950250e1047061e6cf449a29](https://github.com/muness/node-ical/commit/97c341a9d3977d23950250e1047061e6cf449a29),
the fix in [upstream PR #559](https://github.com/jens-maus/node-ical/pull/559)
for [upstream issue #560](https://github.com/jens-maus/node-ical/issues/560)
and [Obsidian ICS #263](https://github.com/open-horizon-labs/obsidian-ics/issues/263).

It preserves early years in all-day parsing and recurrence expansion. The
package contains both the ESM sources used by the plugin build and the generated
CommonJS entry point used by Jest. Its Apache-2.0 license is inside the archive.
The original upstream package version is retained; the filename identifies our
patched revision.

The archive is checked in so `npm ci` works without a sibling checkout,
Git credentials, or a dependency build. npm verifies its integrity using
`package-lock.json`. SHA-256:

```text
237f4ccc52a9c80dfc765752fde0397828840ca736cdd2eaa07a5b7addc39dee
```

## Rebuild from source

In a clean clone of the fork, with Node 22 or newer:

```sh
git checkout 97c341a9d3977d23950250e1047061e6cf449a29
npm ci
npm test
npm pack
```

Rename the resulting `node-ical-0.27.2.tgz` to the filename above. The pack
lifecycle builds the CommonJS entry point. Review regenerated archive contents
and update the checksum and lockfile if rebuilding with different tooling.

## Remove after upstream release

Once a published node-ical version contains the full PR:

1. Replace the file dependency with that published version using `npm install`.
2. Remove the archive and this note.
3. Keep `tests/issue-263-low-year-date-only.test.ts`.
4. Run `npm ci`, `npm test`, `npm run build`, and
   `npm run test:dist-artifact`.
