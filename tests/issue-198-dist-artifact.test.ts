import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  registerIssue198GetEventsSuite,
  type Issue198PluginCtor,
  type Issue198PluginLike,
} from './helpers/issue198Suite';

// Regression coverage for https://github.com/open-horizon-labs/obsidian-ics/issues/198,
// one layer below tests/issue-198-getEvents-fields.test.ts.
//
// That suite proves the TypeScript SOURCE constructs all four fields. It does
// not prove the COMPILED, SHIPPED dist/main.js does - which is exactly the
// gap the #198 beta2 report fell into: the source was correct the whole time,
// but nobody had ever loaded the actual built artifact and called its public
// getEvents() API. This file does that, twice:
//
//   1. Directly against dist/main.js (real Node `require`, no ts-jest
//      transform involved - .js files aren't in jest.config.js's transform
//      map, so this executes esbuild's literal bundled output).
//   2. Against a byte-for-byte copy of dist/main.js (+ manifest + styles.css)
//      placed in an isolated temp directory shaped like a real Obsidian
//      plugin folder (.obsidian/plugins/ics/), loaded via a hand-built,
//      self-contained "obsidian" shim placed in that temp tree's own
//      node_modules - not Jest's mock, not this project's node_modules - so
//      this half of the suite does not depend on Jest's module registry
//      reaching outside its configured roots.
//
// Neither path imports anything from src/ or re-executes TypeScript: the only
// way for this file to pass is for the actual compiled bundle to behave
// correctly when its real public API is called.

const DIST_MAIN_JS = path.resolve(__dirname, '..', 'dist', 'main.js');

function requireDistMainJs(): Issue198PluginCtor {
  if (!fs.existsSync(DIST_MAIN_JS)) {
    throw new Error(
      `${DIST_MAIN_JS} does not exist. This suite exercises the compiled release ` +
      'artifact, not TypeScript source - run "npm run build" first (this is what ' +
      '"npm run test:dist-artifact" does).',
    );
  }
  // require(), not a static import: loading a built artifact by a computed
  // path is the point of this test. See the eslint.config.mjs override for
  // this file, which turns off @typescript-eslint/no-require-imports here
  // instead of suppressing it inline (the project's convention - see the
  // ICSSettingsTab.ts override above for the same reasoning).
  const loaded = require(DIST_MAIN_JS) as { default?: Issue198PluginCtor };
  if (typeof loaded.default !== 'function') {
    throw new Error(
      `${DIST_MAIN_JS} did not export a default class constructor as expected ` +
      '(esbuild CJS output should expose it as module.exports.default). Got: ' +
      `${typeof loaded.default}`,
    );
  }
  return loaded.default;
}

// Builds <tmpRoot>/node_modules/obsidian (a plain CJS module, resolved by
// ordinary Node module resolution - no Jest involved) and
// <tmpRoot>/plugin/{main.js,manifest.json,styles.css} (a copy of the real
// build output, standing in for .obsidian/plugins/ics/). Returns the plugin
// folder path and the manifest actually used, for the caller to record.
function buildIsolatedPluginFolder(): { pluginDir: string; manifest: { id?: string; version?: string } } {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-ics-artifact-'));
  const nodeModulesObsidian = path.join(tmpRoot, 'node_modules', 'obsidian');
  fs.mkdirSync(nodeModulesObsidian, { recursive: true });

  const projectRoot = path.resolve(__dirname, '..');
  const momentPath = require.resolve('moment', { paths: [projectRoot] });

  fs.writeFileSync(
    path.join(nodeModulesObsidian, 'package.json'),
    JSON.stringify({ name: 'obsidian', main: 'index.js' }),
  );
  // Deliberately independent of tests/__mocks__/obsidian.ts: this shim is
  // resolved by plain Node `require`, not Jest's manual-mock registry, so the
  // isolated-folder half of this suite proves the artifact runs correctly
  // under ordinary Node module resolution too, not only inside Jest.
  fs.writeFileSync(
    path.join(nodeModulesObsidian, 'index.js'),
    `'use strict';
class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; }
  addSettingTab() {}
  addCommand() {}
}
class Notice {
  constructor(message, timeout) { this.message = message; this.timeout = timeout; }
}
class PluginSettingTab {
  constructor(app, plugin) { this.app = app; this.plugin = plugin; }
}
class Modal {
  constructor(app) { this.app = app; }
}
function request() { throw new Error('request() is not shimmed - use calendarType "vdir"'); }
const moment = require(${JSON.stringify(momentPath)});
module.exports = { Plugin, Notice, PluginSettingTab, Modal, request, moment };
`,
  );

  const pluginDir = path.join(tmpRoot, 'plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.copyFileSync(DIST_MAIN_JS, path.join(pluginDir, 'main.js'));

  const distManifest = path.join(path.dirname(DIST_MAIN_JS), 'manifest.json');
  const rootManifest = path.join(projectRoot, 'manifest.json');
  const manifestSource = fs.existsSync(distManifest) ? distManifest : rootManifest;
  fs.copyFileSync(manifestSource, path.join(pluginDir, 'manifest.json'));

  const distStyles = path.join(path.dirname(DIST_MAIN_JS), 'styles.css');
  const rootStyles = path.join(projectRoot, 'styles.css');
  const stylesSource = fs.existsSync(distStyles) ? distStyles : rootStyles;
  if (fs.existsSync(stylesSource)) {
    fs.copyFileSync(stylesSource, path.join(pluginDir, 'styles.css'));
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf8')) as {
    id?: string;
    version?: string;
  };

  return { pluginDir, manifest };
}

function requireCopiedPlugin(pluginDir: string): Issue198PluginCtor {
  const copiedMainJs = path.join(pluginDir, 'main.js');
  const loaded = require(copiedMainJs) as { default?: Issue198PluginCtor };
  if (typeof loaded.default !== 'function') {
    throw new Error(`${copiedMainJs} did not export a default class constructor as expected.`);
  }
  return loaded.default;
}

describe('issue #198 - compiled artifact identity', () => {
  it('dist/main.js exists and exports a usable ICSPlugin constructor', () => {
    const PluginCtor = requireDistMainJs();
    expect(typeof PluginCtor).toBe('function');
    const proto = PluginCtor.prototype as Issue198PluginLike;
    expect(typeof proto.getEvents).toBe('function');
  });

  it('an isolated plugin-folder copy of the artifact loads and reports its own manifest identity', () => {
    const { pluginDir, manifest } = buildIsolatedPluginFolder();
    expect(fs.existsSync(path.join(pluginDir, 'main.js'))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'manifest.json'))).toBe(true);
    expect(manifest.id).toBe('ics');
    expect(typeof manifest.version).toBe('string');
    expect(manifest.version).not.toHaveLength(0);

    const PluginCtor = requireCopiedPlugin(pluginDir);
    const proto = PluginCtor.prototype as Issue198PluginLike;
    expect(typeof proto.getEvents).toBe('function');

    // Recorded via stdout (not console.log, which this project's lint config
    // forbids in plugin code) so CI logs show what was actually verified.
    process.stdout.write(
      `[issue-198 artifact check] isolated plugin folder: ${pluginDir}\n` +
      `  manifest: id=${manifest.id} version=${manifest.version}\n` +
      `  copied main.js size: ${fs.statSync(path.join(pluginDir, 'main.js')).size} bytes`,
    );
  });
});

registerIssue198GetEventsSuite('compiled dist/main.js (direct require)', requireDistMainJs());

{
  const { pluginDir, manifest } = buildIsolatedPluginFolder();
  const CopiedPluginCtor = requireCopiedPlugin(pluginDir);
  registerIssue198GetEventsSuite(
    `compiled dist/main.js (isolated plugin folder copy, manifest v${manifest.version})`,
    CopiedPluginCtor,
  );
}
