// Minimal mock for obsidian module - only what's needed for headless ICS parsing.
// Typed via requireActual's generic so consumers get moment's real types rather
// than `any`, which would spread through every test that touches a date.
export const moment = jest.requireActual<typeof import('moment')>('moment');
