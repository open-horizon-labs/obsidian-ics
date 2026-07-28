// Minimal mock for obsidian module - only what's needed for headless ICS parsing.
// Typed via requireActual's generic so consumers get moment's real types rather
// than `any`, which would spread through every test that touches a date.
export const moment = jest.requireActual<typeof import('moment')>('moment');

// Minimal stand-ins so ICSPlugin (which extends Plugin and calls `new Notice`)
// can be instantiated headlessly to exercise the real getEvents() method,
// rather than only the helpers it calls internally.
export class Plugin {
  app: unknown;
  manifest: unknown;
  constructor(app?: unknown, manifest?: unknown) {
    this.app = app;
    this.manifest = manifest;
  }
  addSettingTab(): void { /* no-op in tests */ }
  addCommand(): void { /* no-op in tests */ }
}

export class Notice {
  constructor(public message: string, public timeout?: number) { /* no-op in tests */ }
}

// Only needed so ICSSettingsTab (imported transitively by main.ts) has a
// base class to extend at module load time - its settings UI is never
// exercised by these tests.
export class PluginSettingTab {
  app: unknown;
  plugin: unknown;
  constructor(app?: unknown, plugin?: unknown) {
    this.app = app;
    this.plugin = plugin;
  }
}

// Only needed so ICSSettingsTab's ConfirmModal (imported transitively by
// main.ts) has a base class to extend at module load time.
export class Modal {
  app: unknown;
  constructor(app?: unknown) {
    this.app = app;
  }
}

export function request(): Promise<string> {
  throw new Error('request() is not mocked - use calendarType "vdir" in tests instead of remote ICS URLs');
}
