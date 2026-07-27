import { Calendar } from "./settings/ICSSettings";

export interface IEvent {
	utime: string; // Unix timestamp representing the event start time
	endUtime: string; // Unix timestamp representing the event end time
	time: string; // Human-readable representation of the event start time
	endTime: string; // Human-readable representation of the event end time
	// Full ISO 8601 start/end (with UTC offset), unlike time/endTime which are
	// clock times only and so can't express a multi-day event. These are
	// normalized: the timezone is resolved, a DURATION is expanded into an end,
	// and an absent DTEND/DURATION falls back to the RFC 5545 default.
	startDateTime: string;
	endDateTime: string;
	// True when DTSTART/DTEND are VALUE=DATE (an all-day event). DTEND is
	// exclusive for these, so a holiday running through Sep 14 has an
	// endDateTime of Sep 15 00:00 - subtract a day to display the last day.
	allDay: boolean;
	created: string; // Unix timestamp representation of the creation timestamp of the event
	sequence: number; // The revision sequence number of the calendar component within a sequence of revisions.
	lastModified: string; // Unix timestamp representation of when the event was last revised
	recurrent: boolean; // Is true if this is a recurrent event
	icsName: string; // Name of the calendar the event is associated with
	summary: string; // Summary or title of the event
	description: string; // Detailed description of the event
	format: Calendar["format"]; // Format preference for the event
	location: string; // Physical location where the event takes place, if applicable
	callUrl: string; // URL for joining online meetings/calls associated with the event (backward compatibility)
	callType: string; // Type of online meeting (e.g., Zoom, Skype, etc.) (backward compatibility)
	extractedFields: Record<string, string[]>; // Generic field extraction results
	organizer: IOrganizer; // Email of the organizer of the event
  attendees: IAttendee[]; // Array of attendees
  eventType: string; // Type of event (e.g., one-off, recurring, recurring override)
  uid: string | null; // The ICS UID property uniquely identifying the event
  url: string | null; // The ICS URL property, if the event specifies one
}

export interface IAttendee {
  email: string;
  name: string;
  role: string;
  status: string; // Participation status (accepted, declined, etc.)
  type: string; // Participant type (individual, group, resource, room, etc.)
}

export interface IOrganizer {
  email: string;
  name: string;
}
