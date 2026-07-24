import * as ical from 'node-ical';
import { tz } from 'moment-timezone';
import { moment } from "obsidian";
import { WINDOWS_TO_IANA_TIMEZONES } from './generated/windowsTimezones';

import { FieldExtractionPattern } from './settings/ICSSettings';

export function extractFields(e: any, patterns?: FieldExtractionPattern[]): Record<string, string[]> {
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

function findPatternMatches(e: any, pattern: FieldExtractionPattern): string[] {
  const matches: string[] = [];

  // Special handling for Google Meet conference data
  if (pattern.pattern === "GOOGLE-CONFERENCE" && e["GOOGLE-CONFERENCE"]) {
    matches.push(e["GOOGLE-CONFERENCE"]);
    return matches;
  }

  // Check location field
  if (e.location) {
    const locationMatches = matchTextForPattern(e.location, pattern);
    matches.push(...locationMatches);
  }

  // Check description field
  if (e.description) {
    const descriptionMatches = matchTextForPattern(e.description, pattern);
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
      let match;
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


function applyRecurrenceDateAndTimezone(originalDate: Date, currentDate: Date, tzid: string): Date {
  const originalMoment = tz(originalDate, tzid);

  // Create a moment in the target timezone using just the date components of currentDate
  // This avoids timezone conversion issues with the recurrence date
  const currentDateMoment = moment.utc(currentDate);
  const adjustedMoment = tz(`${currentDateMoment.format('YYYY-MM-DD')} ${originalMoment.format('HH:mm:ss')}`, tzid);

  return adjustedMoment.toDate();
}

function isExcluded(recurrenceDate: moment.Moment, exdateArray: moment.Moment[]): boolean {
  return exdateArray.some(exDate => exDate.isSame(recurrenceDate, 'day'));
}

function processRecurrenceOverrides(event: any, sortedDaysToMatch: string[], _excludedDates: moment.Moment[], matchingEvents: any[]) {
  // node-ical keys event.recurrences by both a date-only key and a full
  // ISO-timestamp key for the same override, so the same override object
  // can appear twice under different keys. Dedupe by recurrenceid.
  const seenRecurrenceIds = new Set<number>();

  for (const date in event.recurrences) {
    const recurrence = event.recurrences[date];
    const recurrenceMoment = moment(date).startOf('day');

    const recurrenceIdTime = recurrence.recurrenceid instanceof Date
      ? recurrence.recurrenceid.getTime()
      : undefined;
    if (recurrenceIdTime !== undefined) {
      if (seenRecurrenceIds.has(recurrenceIdTime)) {
        continue;
      }
      seenRecurrenceIds.add(recurrenceIdTime);
    }

    // Skip canceled overrides
    if (recurrence.status && recurrence.status.toUpperCase() === "CANCELLED") {
      console.debug(`Skipping canceled recurrence override: ${recurrence.summary} on ${date}`);
      continue;
    }

    recurrence.recurrent = true;

    // Check if this override matches the dayToMatch
    if (moment(recurrence.start).isBetween(sortedDaysToMatch[0], sortedDaysToMatch[sortedDaysToMatch.length - 1], "day", "[]")) {
      console.debug(`Adding recurring event with override: ${recurrence.summary} on ${recurrenceMoment.format('YYYY-MM-DD')}`);
      recurrence.eventType = "recurring override";
      matchingEvents.push(recurrence);
    }
  }
}

function processRecurringRules(event: any, sortedDaysToMatch: string[], excludedDates: moment.Moment[], matchingEvents: any[]) {
  const tzid = event.rrule.origOptions.tzid || 'UTC';

  // Use UTC for rrule calculations to avoid timezone offset issues
  const startOfRange = moment.utc(sortedDaysToMatch[0]).subtract(1, 'day').startOf('day').toDate();
  const endOfRange = moment.utc(sortedDaysToMatch[sortedDaysToMatch.length - 1]).add(1, 'day').endOf('day').toDate();

  // Get recurrence dates within the range
  const recurrenceDates = event.rrule.between(startOfRange, endOfRange, true);

  recurrenceDates.forEach(recurrenceDate => {
    const recurrenceMoment = tz(recurrenceDate, tzid).startOf('day');

    if (isExcluded(recurrenceMoment, excludedDates)) {
      console.debug(`Skipping excluded recurrence: ${event.summary} on ${recurrenceMoment.format('YYYY-MM-DD')}`);
      return;
    }

    // Clone the event and apply proper timezone-aware date/time calculation
    const clonedEvent = { ...event };
    clonedEvent.start = applyRecurrenceDateAndTimezone(event.start, recurrenceDate, tzid);
    clonedEvent.end = applyRecurrenceDateAndTimezone(event.end, recurrenceDate, tzid);

    delete clonedEvent.rrule;
    clonedEvent.recurrent = true;

    // Check if the recurrence falls within the requested date range using timezone-aware comparison
    const eventStartMoment = tz(clonedEvent.start, tzid);
    const eventStartDate = eventStartMoment.format('YYYY-MM-DD');
    if (sortedDaysToMatch.includes(eventStartDate)) {
      console.debug(`Adding recurring event: ${clonedEvent.summary} ${clonedEvent.start} - ${clonedEvent.end}`);
      console.debug("Excluded dates:", excludedDates.map(date => date.format('YYYY-MM-DD')));

      console.debug(clonedEvent);
      clonedEvent.eventType = "recurring";
      matchingEvents.push(clonedEvent);
    }
  });
}

function shouldIncludeOngoing(event: any, dayToMatch: string): boolean {
  const day = moment(dayToMatch, 'YYYY-MM-DD').startOf('day');
  const eventStartDay = moment(event.start).startOf('day');
  const eventEndDay = moment(event.end).startOf('day');

  // Avoid duplicating the initial occurrence; it's already included elsewhere.
  if (day.isSame(eventStartDay, 'day')) {
    return false;
  }

  // Include full days between start and end.
  if (day.isBetween(eventStartDay, eventEndDay, 'day', '()')) {
    return true;
  }

  // Include the ending day when the event continues past its start.
  if (day.isSame(eventEndDay, 'day')) {
    return moment(event.end).diff(eventEndDay, 'minutes') > 0;
  }

  return false;
}

export function filterMatchingEvents(icsArray: any[], daysToMatch: string[], showOngoing: boolean) {
  const sortedDaysToMatch = [...daysToMatch].sort();
  return icsArray.reduce((matchingEvents, event) => {
    // Skip canceled parent events
    if (event.status && event.status.toUpperCase() === "CANCELLED") {
      console.debug(`Skipping canceled event: ${event.summary}`);
      return matchingEvents;
    }

    // Populate excluded dates from exdates and recurrence overrides
    const excludedDates = [
      ...(event.exdate
        ? Object.keys(event.exdate).map(key => {
          const date = tz(event.exdate[key], event.exdate[key].tz || 'UTC');
          return date.startOf('day');
        })
        : []),

      // Add overridden dates from recurrences
      ...(event.recurrences
        ? Object.keys(event.recurrences).map(key => moment(key).startOf('day'))
        : [])
    ];

    // Process recurrence overrides to populate matching events and excluded dates
    if (event.recurrences) {
      processRecurrenceOverrides(event, sortedDaysToMatch, excludedDates, matchingEvents);
    }

    // Process recurring rules, skipping overridden dates
    if (event.rrule) {
      processRecurringRules(event, sortedDaysToMatch, excludedDates, matchingEvents)
    }

    // Process non-recurring events
    if (!event.recurrences && !event.rrule && moment(event.start).isBetween(sortedDaysToMatch[0], sortedDaysToMatch[sortedDaysToMatch.length - 1], "day", "[]")) {
      console.debug("Adding one-off event:", {
        summary: event.summary,
        start: event.start,
        end: event.end,
        recurrenceId: event.recurrenceid || null,
        isRecurring: !!event.rrule || !!event.recurrences,
      });
      event.eventType = "one-off";
      matchingEvents.push(event);
    }

    // Include ongoing events
    if (showOngoing && daysToMatch.some(dayToMatch => shouldIncludeOngoing(event, dayToMatch))) {
      matchingEvents.push(event);
    }

    return matchingEvents;
  }, []);
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

export function parseIcs(ics: string) {
  try {
    // First, try parsing the ICS as-is
    const data = ical.parseICS(ics);
    const vevents = [];

    for (const i in data) {
      if (data[i].type != "VEVENT")
        continue;
      vevents.push(data[i]);
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
        const vevents = [];

        for (const i in data) {
          if (data[i].type != "VEVENT")
            continue;
          vevents.push(data[i]);
        }

        return vevents;
      } catch (preprocessError) {
        console.error('Failed to parse ICS even after preprocessing:', preprocessError);
        throw new Error(`ICS parsing failed: ${error.message}. Preprocessing also failed: ${preprocessError.message}`);
      }
    } else {
      // Re-throw non-timezone related errors
      throw error;
    }
  }
}
