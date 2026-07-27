import { readFileSync } from 'fs';
import { join } from 'path';

// Obsidian's declarative settings API - getSettingDefinitions() instead of
// display(), setDestructive() instead of setWarning() - is @since 1.13.0.
// ICSSettingsTab still uses the pre-1.13 APIs, and eslint.config.mjs silences
// @typescript-eslint/no-deprecated for that file, because adopting the new API
// would break every user below 1.13.0.
//
// That exemption is only justified while we still support such users. This test
// fails the moment every shipped manifest requires 1.13.0 or later, so the
// exemption gets removed and the settings tab migrated - rather than the comment
// quietly outliving its reason.
const MIGRATION_REQUIRED_AT = '1.13.0';

const repoRoot = join(__dirname, '..');

function readMinAppVersion(manifest: string): string {
  const raw = readFileSync(join(repoRoot, manifest), 'utf8');
  const { minAppVersion } = JSON.parse(raw) as { minAppVersion: string };
  return minAppVersion;
}

// Numeric compare; these manifests only ever carry plain x.y.z versions.
function isAtLeast(version: string, floor: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [a, b] = [parse(version), parse(floor)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return true;
}

describe('deprecated settings API exemption', () => {
  it('compares versions correctly', () => {
    expect(isAtLeast('1.13.0', MIGRATION_REQUIRED_AT)).toBe(true);
    expect(isAtLeast('1.13.4', MIGRATION_REQUIRED_AT)).toBe(true);
    expect(isAtLeast('1.9.12', MIGRATION_REQUIRED_AT)).toBe(false);
    expect(isAtLeast('1.12.7', MIGRATION_REQUIRED_AT)).toBe(false);
  });

  it('is still justified by a supported Obsidian version below 1.13.0', () => {
    const manifests = ['manifest.json', 'manifest-beta.json'];
    const versions = manifests.map(m => `${m}: ${readMinAppVersion(m)}`);
    const stillSupportsPre113 = manifests.some(m => !isAtLeast(readMinAppVersion(m), MIGRATION_REQUIRED_AT));

    // If this fails, minAppVersion has caught up. Migrate ICSSettingsTab to
    // getSettingDefinitions()/setDestructive(), then delete both the eslint
    // exemption for that file in eslint.config.mjs and this test.
    expect({ stillSupportsPre113, versions }).toEqual({ stillSupportsPre113: true, versions });
  });
});
