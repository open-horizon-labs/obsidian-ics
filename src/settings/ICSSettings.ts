export interface FieldExtractionPattern {
    name: string;
    pattern: string;
    matchType: 'regex' | 'contains';
    priority: number;
    extractedFieldName: string;
}

export interface ICSSettings {
    format: {
        timeFormat: string
        dataViewSyntax: boolean,
    },
    calendars: Record < string, Calendar > ;
    fieldExtraction: {
        enabled: boolean;
        patterns: FieldExtractionPattern[];
    };
}

export interface Calendar {
    icsUrl: string;
    icsName: string;

    /**
     * Optional field for storing the owner email of this calendar.
     * Used when checking PARTSTAT=DECLINED for that email.
     */
    ownerEmail?: string;

    calendarType: 'remote' | 'vdir';
    format: {
        checkbox: boolean;
        includeEventEndTime: boolean;
        icsName: boolean;
        summary: boolean;
        location: boolean;
        description: boolean;
        showAttendees: boolean;
        showOngoing: boolean;
        showTransparentEvents: boolean;
    }
}

export const DEFAULT_CALENDAR_FORMAT = {
    checkbox: true,
    includeEventEndTime: true,
    icsName: true,
    summary: true,
    location: true,
    description: false,
    calendarType: 'remote',
    showAttendees: false,
    // On by default: a multi-day event showing up only on its start day reads
    // as a bug to anyone who didn't know this toggle existed. Only affects
    // newly added calendars - existing ones keep whatever they saved.
    showOngoing: true,
    showTransparentEvents: false
};

export const DEFAULT_FIELD_EXTRACTION_PATTERNS: FieldExtractionPattern[] = [
    {
        name: "Google Meet",
        pattern: "GOOGLE-CONFERENCE",
        matchType: "contains",
        priority: 1,
        extractedFieldName: "Video Call URLs"
    },
    {
        name: "Zoom",
        pattern: "zoom.us",
        matchType: "contains",
        priority: 2,
        extractedFieldName: "Video Call URLs"
    },
    {
        name: "Skype",
        pattern: "https:\\/\\/join\\.skype\\.com\\/[a-zA-Z0-9]+",
        matchType: "regex",
        priority: 3,
        extractedFieldName: "Video Call URLs"
    },
    {
        name: "Microsoft Teams",
        pattern: "https:\\/\\/teams\\.microsoft\\.com\\/l\\/meetup-join\\/[^>]+",
        matchType: "regex",
        priority: 4,
        extractedFieldName: "Video Call URLs"
    }
];

export const DEFAULT_SETTINGS: ICSSettings = {
    format: {
        timeFormat: "HH:mm",
        dataViewSyntax: false,
    },
    calendars: {
    },
    fieldExtraction: {
        enabled: true,
        patterns: DEFAULT_FIELD_EXTRACTION_PATTERNS
    }
};
