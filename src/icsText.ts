import type * as ical from 'node-ical';

// SUMMARY/LOCATION/DESCRIPTION are ICS "TEXT" properties: node-ical returns a
// plain string unless the property carries parameters, in which case it's
// { val, params } instead.
//
// Lives in its own module so both icalUtils and occurrences can use it without
// importing each other at runtime (icalUtils already depends on occurrences).
// icalUtils re-exports it, which is where callers have always imported it from.
export function textValue(value: ical.ParameterValue<string, Record<string, string>> | undefined): string {
  return typeof value === 'string' ? value : value?.val ?? '';
}
