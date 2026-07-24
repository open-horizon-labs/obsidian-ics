# Contributing

Thanks for improving the ICS Calendar plugin. Keep changes focused and
preserve backward compatibility for existing user templates (`callUrl`,
`callType`, `getEvents()` signatures, output format).

## Setup

```sh
npm install
```

Run the verification set before opening a pull request:

```sh
npm test
npm run build
```

## Changes

- Create a feature branch off `master` before starting work and push it to
  `origin` (see `.cursorrules`). `master` is a protected branch - commits
  land via pull request, not a direct push.
- Any change to timezone, recurrence, or date-normalization logic needs an
  accompanying Jest test (see `tests/README.md`).
- Extend calendar-event behavior through the generic `extractedFields`
  pattern-matching system rather than hardcoding new special cases.
- Windows -> IANA timezone data is generated (`npm run update-timezones`),
  not hand-edited.

## Release

Maintainers cut releases from a clean `master` checkout:

- Stable: `./release.sh <version> <minimum-obsidian-version>` opens a
  `release/<version>` PR. Merging it builds the plugin and creates a
  **draft** GitHub release - review its assets and notes before publishing.
- Beta: `./release-beta.sh <version> <minimum-obsidian-version>` opens a
  `beta/<version>` PR. Merging it builds and publishes a pre-release
  **automatically**.

### Beta version numbers are one-way

Obsidian's stock "Check for updates" does not support the full semver spec -
it only compares plain `number.number.number` versions and does not
understand pre-release suffixes at all. If a user installs `X.Y.Z-betaN` (via
BRAT) and you later publish the real `X.Y.Z` stable release, Obsidian's
updater will not offer it - the user is stuck reporting "up to date" forever,
with no path back to the stable channel short of a manual reinstall.

**Once any `X.Y.Z-betaN` has shipped, `X.Y.Z` is burned.** The real stable
release for that work must ship as a version *higher* than `X.Y.Z` - bump at
least the patch, and prefer a minor bump for a safer margin. Never reuse the
exact base version the betas were numbered against.

See [obsidian42-brat's developer guide](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md)
and this [forum thread](https://forum.obsidian.md/t/functional-update-to-brat-version-picker-github-pre-releases-and-frozen-version-updates/98951)
for the underlying mechanics.
