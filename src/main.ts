import {
  Editor, moment,
  MarkdownView, Notice
} from 'obsidian';

import {
  Calendar,
  ICSSettings,
  DEFAULT_SETTINGS,
  DEFAULT_FIELD_EXTRACTION_PATTERNS,
} from "./settings/ICSSettings";

import ICSSettingsTab from "./settings/ICSSettingsTab";

import {
  getDateFromFile
} from "obsidian-daily-notes-interface";

import {
  Plugin,
  request
} from 'obsidian';
import { parseIcs, filterMatchingEvents, extractFields } from './icalUtils';
import { IEvent } from './IEvent';
import { DateNormalizer, FlexibleDateInput } from './DateNormalizer';

export default class ICSPlugin extends Plugin {
  data: ICSSettings;

  async addCalendar(calendar: Calendar): Promise<void> {
    this.data.calendars = {
      ...this.data.calendars,
      [calendar.icsName]: calendar
    };
    await this.saveSettings();
  }

  async removeCalendar(calendar: Calendar) {
    if (this.data.calendars[calendar.icsName]) {
      delete this.data.calendars[calendar.icsName];
    }
    await this.saveSettings();
  }

  formatEvent(e: IEvent): string {
    const callLinkOrLocation = e.callType ? `[${e.callType}](${e.callUrl})` : e.location;
    const attendeeList = e.attendees.map(attendee => {
      // Check if the name and the email are identical
      const displayName = attendee.name === attendee.email
        ? attendee.name  // If identical, use only one of them
        : `${attendee.name} (${attendee.email})`; // If not, use both
      return `\t\t- ${displayName}: ${attendee.status}`;
    }).join('\n');

    // Conditionally format start and end time based on dataViewSyntax setting
    const startTimeFormatted = this.data.format.dataViewSyntax ? `[startTime:: ${e.time}]` : `${e.time}`;
    const endTimeFormatted = e.format.includeEventEndTime ? (this.data.format.dataViewSyntax ? `[endTime:: ${e.endTime}]` : `- ${e.endTime}`) : '';

    // Combine all parts of the formatted event string
    return [
      `- ${e.format.checkbox ? '[ ]' : ''}`,
      startTimeFormatted,
      endTimeFormatted,
      e.format.icsName ? e.icsName : '',
      e.format.summary ? e.summary : '',
      e.format.location ? callLinkOrLocation : '',
      e.format.description && e.description ? `\n\t- ${e.description}` : '',
      e.format.showAttendees && e.attendees.length > 0 ? `\n\t- Attendees:\n${attendeeList}` : ''
    ].filter(Boolean).join(' ').trim();
  }


  async getEvents(...dates: FlexibleDateInput[]): Promise<IEvent[]> {
    if (dates.length === 0 || dates.some(date => !date)) {
      new Notice(`⚠️ ICS Plugin: No valid date provided to getEvents(). ${DateNormalizer.getSupportedFormatsDescription()}`, 10000);
    }

    // Normalize all date inputs to YYYY-MM-DD string format
    let normalizedDates: string[];
    try {
      normalizedDates = DateNormalizer.normalizeDateInputs(dates);
    } catch (error) {
      new Notice(`⚠️ ICS Plugin: Error parsing date inputs: ${error.message}`, 10000);
      console.error("Date parsing error:", error);
      return [];
    }

    const events: IEvent[] = [];
    const errorMessages: string[] = []; // To store error messages

    for (const calendar in this.data.calendars) {
      const calendarSetting = this.data.calendars[calendar];
      let icsArray: any[] = [];

      try {
        if (calendarSetting.calendarType === 'vdir') {
          // Assuming you have a method to list files in a directory
          const icsFiles = this.app.vault.getFiles().filter(f => f.extension == "ics" && f.path.startsWith(calendarSetting.icsUrl));
          for (const icsFile of icsFiles) {
            const fileContent = await this.app.vault.read(icsFile);
            icsArray = icsArray.concat(parseIcs(fileContent));
          }
        } else {
          // Existing logic for remote URLs
          icsArray = parseIcs(await request({ url: calendarSetting.icsUrl }));
        }
      } catch (processingError) {
        console.error(`Error processing calendar ${calendarSetting.icsName}: ${processingError}`);
        errorMessages.push(`Error processing calendar "${calendarSetting.icsName}"`);
      }

      let dateEvents;

      // Exception handling for parsing and filtering
      try {
        dateEvents = filterMatchingEvents(icsArray, normalizedDates, calendarSetting.format.showOngoing)
          .filter(e => this.excludeTransparentEvents(e, calendarSetting))
          .filter(e => this.excludeDeclinedEvents(e, calendarSetting));

          // Deduplicate events based on calendar, title, start, and end time
          const uniqueEventSet = new Set();
          dateEvents = dateEvents.filter(e => {
            const uniqueKey = `${e.calendar}-${e.summary}-${e.start}-${e.end}`;
            if (uniqueEventSet.has(uniqueKey)) {
              return false;
            } else {
              uniqueEventSet.add(uniqueKey);
              return true;
            }
          });

      } catch (filterError) {
        console.error(`Error filtering events for calendar ${calendarSetting.icsName}: ${filterError}`);
        errorMessages.push(`Error filtering events in calendar "${calendarSetting.icsName}"`);
      }

      try {
        dateEvents.forEach((e) => {
          const patterns = this.data.fieldExtraction?.enabled ? this.data.fieldExtraction.patterns : [];
          const extractedFields = extractFields(e, patterns);

          // Backward compatibility: extract first Video Call URL and type
          // Support both old singular and new plural field names
          const videoCallUrls = extractedFields['Video Call URLs'] || extractedFields['Video Call URL'] || [];
          const callUrl = videoCallUrls.length > 0 ? videoCallUrls[0] : null;

          // For callType, we could derive it from the pattern name, but since we're going generic,
          // let's just use "Video Call" as a generic type when we have a URL
          const callType = callUrl ? "Video Call" : null;

          const event: IEvent = {
            utime: moment(e.start).format('X'),
            time: moment(e.start).format(this.data.format.timeFormat),
            endTime: moment(e.end).format(this.data.format.timeFormat),
            created: moment(e.created).format('X'),
            sequence: e.sequence || 0,
            recurrent: e.recurrent ? true : false,
            lastModified: e.lastmodified ? moment(e.lastmodified).format('X') : moment(e.created).format('X'),
            icsName: calendarSetting.icsName,
            summary: e.summary,
            description: e.description,
            format: calendarSetting.format,
            location: e.location ? e.location : null,
            callUrl: callUrl,
            callType: callType,
            extractedFields: extractedFields,
            eventType: e.eventType,
            uid: e.uid ? e.uid : null,
            url: e.url ? e.url : null,
            organizer: { email: e.organizer?.val?.substring(7) || null, name: e.organizer?.params?.CN || null },
            attendees: e.attendee ? (Array.isArray(e.attendee) ? e.attendee : [e.attendee]).map(attendee => ({
              name: attendee.params?.CN,
              email: attendee.val?.substring(7),
              status: attendee.params?.PARTSTAT,
              role: attendee.params?.ROLE,
              type: attendee.params?.CUTYPE || "INDIVIDUAL"
            })) : []
          };
          events.push(event);
        });
      } catch (parseError) {
        console.error(`Error parsing events for calendar ${calendarSetting.icsName}: ${parseError}`);
        errorMessages.push(`Error parsing events in calendar "${calendarSetting.icsName}"`);
      }
    }

    // Notify the user if any errors were encountered
    if (errorMessages.length > 0) {
      const message = `Encountered ${errorMessages.length} error(s) while processing calendars:\n\n${errorMessages.join('\n')}\nSee console for details.`;
      new Notice(message);
    }

    return events;
  }

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ICSSettingsTab(this.app, this));
    this.addCommand({
      id: "import_events",
      name: "import events",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        let fileDate = "";

        try {
          fileDate = getDateFromFile(view.file, "day").format("YYYY-MM-DD");
        } catch {
          const message = "⚠️ Unable to get valid date from filename. ICS only works with daily notes."
          new Notice(message);
          return;
        }

        const events: any[] = await this.getEvents(fileDate);

        const mdArray = events.sort((a, b) => a.utime - b.utime).map((e) => this.formatEvent(e));
        editor.replaceRange(mdArray.join("\n").concat("\n"), editor.getCursor());
      }
    });
  }

  onunload() {
    return;
  }

  excludeTransparentEvents(event: any, calendarSetting: Calendar): boolean {
    // Check if transparent events should be shown for this calendar
    if (calendarSetting.format.showTransparentEvents) {
      return true;
    }

    // Exclude transparent events if not enabled for this calendar
    if (
      event.transparency &&
      event.transparency.toUpperCase() === "TRANSPARENT"
    ) {
      console.debug(`Excluding transparent event: ${event.summary}`);
      return false;
    }

    return true;
  }

  excludeDeclinedEvents(event: any, calendarSetting: Calendar): boolean {
    if (!event.attendees) {
      event.attendees = Array.isArray(event.attendee)
        ? event.attendee
        : event.attendee
          ? [event.attendee]
          : [];
    }

    // 3. Check if the user (calendar owner) declined
    const ownerEmail = calendarSetting.ownerEmail?.toLowerCase().trim();
    if (ownerEmail) {
      const myAttendee = event.attendees.find((att: any) => {
        const attEmail = att.val?.replace("mailto:", "").toLowerCase().trim();
        return attEmail === ownerEmail;
      });

      if (myAttendee) {
        const partStat = myAttendee.params?.PARTSTAT?.toUpperCase();
        if (partStat === "DECLINED") {
          // The owner of this calendar has declined the event
          console.debug(
            `Skipping event (“${event.summary}”) for ${ownerEmail} due to DECLINED`
          );
          return false;
        }
      }
    }
    return true;
  }

  async loadSettings() {
    this.data = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Migration: migrate from old videoCallExtraction to new fieldExtraction
    let needsSave = false;

    // If old videoCallExtraction exists, migrate it to fieldExtraction
    if ((this.data as any).videoCallExtraction) {
      const oldSettings = (this.data as any).videoCallExtraction;
      this.data.fieldExtraction = {
        enabled: oldSettings.enabled !== false,
        patterns: DEFAULT_FIELD_EXTRACTION_PATTERNS
      };
      delete (this.data as any).videoCallExtraction;
      needsSave = true;
    }

    // Ensure fieldExtraction settings exist and are hydrated
    if (!this.data.fieldExtraction) {
      this.data.fieldExtraction = {
        enabled: true,
        patterns: [...DEFAULT_FIELD_EXTRACTION_PATTERNS]
      };
      needsSave = true;
    } else {
      // Ensure patterns array exists
      if (!this.data.fieldExtraction.patterns) {
        this.data.fieldExtraction.patterns = [...DEFAULT_FIELD_EXTRACTION_PATTERNS];
        needsSave = true;
      }

      // Ensure enabled field exists
      if (this.data.fieldExtraction.enabled === undefined) {
        this.data.fieldExtraction.enabled = true;
        needsSave = true;
      }
    }

    if (needsSave) {
      await this.saveData(this.data);
    }
  }

  async saveSettings() {
    await this.saveData(this.data);
    await this.loadSettings(); // Reload settings to ensure the plugin state is updated
  }
}
