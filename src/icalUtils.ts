import * as ical from 'node-ical';
import type { VEvent } from 'node-ical';
import { WINDOWS_TO_IANA_TIMEZONES } from './generated/windowsTimezones';

import { FieldExtractionPattern } from './settings/ICSSettings';
import { selectOccurrences } from './occurrences';
import { textValue } from './icsText';

// node-ical's VEvent plus the fields this plugin adds while filtering/expanding
// recurrences. All additions are optional since a freshly-parsed VEvent won't
// have them yet.
export type ProcessedEvent = VEvent & {
  recurrent?: boolean;
  eventType?: string;
  'GOOGLE-CONFERENCE'?: string;
};

// extractFields/findPatternMatches only ever look at these three fields, so
// accept just that shape rather than a full ProcessedEvent - callers (and
// tests) shouldn't need to fabricate an entire VEvent to extract fields.
export type FieldExtractionSource = Pick<ProcessedEvent, 'location' | 'description' | 'GOOGLE-CONFERENCE'>;

export function extractFields(e: FieldExtractionSource, patterns?: FieldExtractionPattern[]): Record<string, string[]> {
  // If patterns not provided or empty, return empty object
  if (!patterns || patterns.length === 0) {
    return {};
  }

  const extractedFields: Record<string, string[]> = {};

  // Sort patterns by priority (lower numbers = higher priority)
  const sortedPatterns = patterns.sort((a, b) => a.priority - b.priority);

  for (const pattern of sortedPatterns) {
    const matches = findPatternMatches(e, pattern);
    if (matches.length > 0) {
      const fieldName = pattern.extractedFieldName;
      if (!extractedFields[fieldName]) {
        extractedFields[fieldName] = [];
      }
      extractedFields[fieldName].push(...matches);
    }
  }

  // Deduplicate all extracted fields
  for (const fieldName in extractedFields) {
    extractedFields[fieldName] = [...new Set(extractedFields[fieldName])];
  }

  return extractedFields;
}

function findPatternMatches(e: FieldExtractionSource, pattern: FieldExtractionPattern): string[] {
  const matches: string[] = [];

  // Special handling for Google Meet conference data
  if (pattern.pattern === "GOOGLE-CONFERENCE" && e["GOOGLE-CONFERENCE"]) {
    matches.push(e["GOOGLE-CONFERENCE"]);
    return matches;
  }

  // Check location field (location/description are ICS "TEXT" properties -
  // node-ical returns a plain string unless the property carries parameters,
  // in which case it's { val, params } instead)
  const locationText = typeof e.location === 'string' ? e.location : e.location?.val;
  if (locationText) {
    const locationMatches = matchTextForPattern(locationText, pattern);
    matches.push(...locationMatches);
  }

  // Check description field
  const descriptionText = typeof e.description === 'string' ? e.description : e.description?.val;
  if (descriptionText) {
    const descriptionMatches = matchTextForPattern(descriptionText, pattern);
    matches.push(...descriptionMatches);
  }

  return matches;
}

function matchTextForPattern(text: string, pattern: FieldExtractionPattern): string[] {
  const matches: string[] = [];

  try {
    if (pattern.matchType === 'contains') {
      if (text.includes(pattern.pattern)) {
        // For contains match, try to extract URLs from the text
        const urlMatches = text.match(/https?:\/\/[^\s<>"]+/g);
        if (urlMatches) {
          matches.push(...urlMatches);
        } else {
          // If no URLs found, return the original text
          matches.push(text);
        }
      }
    } else if (pattern.matchType === 'regex') {
      const regex = new RegExp(pattern.pattern, 'g'); // Use global flag to find all matches
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        // If regex has capture groups, use the first group, otherwise use full match
        matches.push(match[1] || match[0]);
      }
    }
  } catch {
    // Skip invalid regex patterns
    console.warn(`Invalid regex pattern: ${pattern.pattern}`);
  }

  return matches;
}


// Re-exported from ./icsText, which is where it now lives so that both this
// module and ./occurrences can use it without a runtime import cycle. Callers
// have always imported it from here.
export { textValue } from './icsText';

export function filterMatchingEvents(icsArray: ProcessedEvent[], daysToMatch: string[], showOngoing: boolean): ProcessedEvent[] {
  // Thin adapter over the occurrence pipeline in ./occurrences: expand each
  // event into concrete occurrences, keep the ones landing on a requested day,
  // and present each as the event-shaped object callers already expect.
  //
  // The returned objects are copies. Filtering used to tag the parsed VEVENTs
  // in place (and node-ical stores one override object under two keys, so a
  // single tag could land on two entries), which made a second call over the
  // same parsed array behave differently from the first.
  return selectOccurrences(icsArray, daysToMatch, showOngoing).map(occurrence => {
    const matched: ProcessedEvent = {
      ...occurrence.source,
      start: occurrence.start,
      end: occurrence.end,
      // The occurrence is the authority on whether this is an all-day range:
      // it may have been recognised as one that an exporter re-encoded with
      // explicit 00:00:00-23:59:59 times. eventDateFields reads datetype to
      // populate the public IEvent.allDay, and other helpers read dateOnly, so
      // both have to agree with the occurrence rather than with the raw VEVENT.
      datetype: occurrence.allDay ? 'date' : 'date-time',
      recurrent: occurrence.recurrent,
      eventType: occurrence.kind,
    };

    if (occurrence.allDay) {
      // Safe to tag: these Dates were built for this occurrence, not taken
      // from the parsed input.
      (matched.start as { dateOnly?: boolean }).dateOnly = true;
      (matched.end as { dateOnly?: boolean }).dateOnly = true;
    }

    // An expanded occurrence is a single instance, not a rule.
    delete matched.rrule;

    console.debug(
      `Matched ${occurrence.kind}: ${textValue(occurrence.source.summary)} `
      + `${occurrence.start.toISOString()} - ${occurrence.end.toISOString()}`,
    );

    return matched;
  });
}

function preprocessMicrosoftIcs(ics: string): string {
  // Microsoft Office 365 can generate ICS files with timezone names that contain spaces
  // and other characters that cause issues with node-ical parsing.
  // This function preprocesses the ICS content to handle these issues.
  //
  // Uses official Unicode CLDR Windows to IANA timezone mappings
  // Source: https://github.com/unicode-org/cldr/blob/main/common/supplemental/windowsZones.xml

  const timezoneReplacements = WINDOWS_TO_IANA_TIMEZONES;

  let processedIcs = ics;

  // Replace timezone IDs in TZID definitions and references
  for (const [microsoftTz, ianaTz] of Object.entries(timezoneReplacements)) {
    // Replace in TZID definitions
    processedIcs = processedIcs.replace(
      new RegExp(`TZID:${microsoftTz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
      `TZID:${ianaTz}`
    );

    // Replace in TZID references (DTSTART, DTEND, RECURRENCE-ID, etc.)
    processedIcs = processedIcs.replace(
      new RegExp(`;TZID=${microsoftTz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'g'),
      `;TZID=${ianaTz}:`
    );
  }

  return processedIcs;
}

export function parseIcs(ics: string): VEvent[] {
  try {
    // First, try parsing the ICS as-is
    const data = ical.parseICS(ics);
    const vevents: VEvent[] = [];

    for (const i in data) {
      const component = data[i];
      if (component.type != "VEVENT")
        continue;
      vevents.push(component);
    }
    return vevents;
  } catch (error) {
    // If parsing fails with a timezone-related error, try preprocessing
    if (error instanceof TypeError &&
        (error.message.includes('startsWith') ||
         error.message.includes('tz'))) {

      console.warn('ICS parsing failed with timezone error, attempting preprocessing:', error.message);

      try {
        const preprocessedIcs = preprocessMicrosoftIcs(ics);
        const data = ical.parseICS(preprocessedIcs);
        const vevents: VEvent[] = [];

        for (const i in data) {
          const component = data[i];
          if (component.type != "VEVENT")
            continue;
          vevents.push(component);
        }

        return vevents;
      } catch (preprocessError) {
        console.error('Failed to parse ICS even after preprocessing:', preprocessError);
        const preprocessMessage = preprocessError instanceof Error ? preprocessError.message : String(preprocessError);
        throw new Error(`ICS parsing failed: ${error.message}. Preprocessing also failed: ${preprocessMessage}`);
      }
    } else {
      // Re-throw non-timezone related errors
      throw error;
    }
  }
}
