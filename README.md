# Obsidian ICS Plugin

![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/open-horizon-labs/obsidian-ics?style=for-the-badge&sort=semver) ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22ics%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&style=for-the-badge)

This is a plugin for [Obsidian](https://obsidian.md). It adds events from calendar/ics URLs to your Daily Note on demand.

This  is designed to work with the Daily Note or [Periodic Notes](https://github.com/liamcain/obsidian-periodic-notes) plugins: specifically it gets the date to search for events during from the currently open daily note. You can use it through Dataview or Templater for more advanced / customized usage.

I highly recommend pairing this with the [Day Planner](https://github.com/ivan-lednev/obsidian-day-planner) plugin: the output format is tuned to support it and you'll get support for seeing the day and week planners.

## Why You Might Want to Use This Plugin

There are many calendar integration plugins available for Obsidian, some with more features and bells and whistles. This plugin focuses on a different philosophy: **clean, maintainable code that adapts to user expectations rather than forcing users to adapt to the plugin**.

Key advantages of this approach include:

- **User-Friendly API**: The `getEvents()` method accepts date strings, moment objects, or Date objects - whatever is most natural for your use case
- **Performance Through Simplicity**: Support for vdir (local calendar cache) enables lightning-fast workflows by treating your local calendar files as a cache
- **Power User Friendly**: Designed for customization and automation through Templater and Dataview rather than trying to be everything to everyone
- **Focused Feature Set**: Does one thing well - importing calendar events into notes - rather than trying to be a full calendar management system
- **Predictable Behavior**: Clean, testable code that behaves consistently across different environments

If you value simplicity, performance, and the ability to customize your calendar integration exactly how you want it, this plugin might be a good fit for your workflow.

## Installation

This plugin is in the community plugin browser in Obsidian. Search for ICS and you can install it from there.

## Setup

### Get Your Google Calendar URL

1. From [Google Calendar](https://calendar.google.com), look on the left-hand side for the "My Calendars" section.
2. Within that list, find the Calendar that you want to integrate into Obsidian.
3. Click on the Three Dots Menu (on the right of the calendar name), then click on 'Settings'.
4. Once on the Settings Page, you should find yourself on the specific calendar's "Settings for my calendars" view. On the left-hand side of the page, click the  "Integrate Calendar" button.
5. On this page, click on the "copy" button next to the "Secret Address in iCal Format". Google Calendar will give you a warning about not sharing it with anyone.

### Get your Microsoft Office 365 Calendar URL

1. From [Outlook Web App](https://outlook.office.com/), click the gear in the upper right to open the settings panel
2. Select Calendar on the left, then Shared Calendars in the middle
3. In the Publish a Calendar section, select the calendar and permissions you want based on the data you want Obsidian to have access to.
4. Click Publish
5. Copy the ICS URL

### Obsidian Plugin Setup

1. Click the "+" button to add a new calendar.
2. Choose a name for the calendar, select "Calendar Type" as "Remote URL", and then paste the Secret Address URL into the box labeled "Calendar URL".
3. Customize your format settings for the specific calendar. These tie to the Output Format for that specific calendar:  whether to include a checkbox for each scheduled item, the event end time, the calendar name, event summary, event location, event description
4. Click "Save" at the bottom of the specific Calendar's view.
5. On the main ICS page, select your time [format](https://momentjs.com/docs/#/displaying/) and whether to emit start and end times as Dataview Metadata. See the below screenshot.
6. Once you've done all of this, use the `ICS: Import events` command. If it shows nothing, check to make sure your iCal URL is the secret URL as that commonly is the issue.

![Settings Screenshot](https://github.com/open-horizon-labs/obsidian-ics/blob/master/docs/2023-09-03-settings.png?raw=true)

### Field Extraction

The plugin can extract custom fields from calendar events using configurable patterns. This powerful feature allows you to extract any text data and organize it into named fields.

> **✨ New in this version**: This expands the previous video call URL extraction feature into a fully generic system. Your existing templates using `callUrl` and `callType` continue to work unchanged, but you now have access to much more powerful extraction capabilities through `extractedFields`.

#### How It Works

- **Flexible Patterns**: Use simple text matching or regular expressions
- **Custom Field Names**: Extract data into any field name you choose
- **Multiple Matches**: Each field can contain multiple extracted values
- **Priority-Based**: Patterns are processed in priority order

#### Default Configuration

By default, the plugin extracts video call URLs into the "Video Call URL" field:

- **Google Meet**: Detected from `GOOGLE-CONFERENCE` field
- **Zoom**: URLs containing `zoom.us`
- **Skype**: URLs matching `https://join.skype.com/` pattern
- **Microsoft Teams**: Teams meeting URLs

#### Custom Extraction Examples

You can create patterns to extract any information:

- **Additional Video Calls**: Extend beyond the defaults:
  - WebEx: `webex.com` → "Video Call URLs" field
  - GoToMeeting: `gotomeeting.com` → "Video Call URLs" field
  - Jitsi: `meet.jit.si` → "Video Call URLs" field
- **Links**: `(https?|ftp|file)://[^\s<>"]+` → "Links" field
- **Phone Numbers**: Create multiple patterns for the same field:
  - US format: `\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}` → "Phone Numbers" field
  - International: `\+\d{1,3}[-.\s]?\d{1,14}` → "Phone Numbers" field
- **Meeting IDs**: `Meeting ID: (\d+)` → "Meeting IDs" field

#### Pattern Configuration

1. **Pattern Types**:
   - **Contains**: Simple text matching (e.g., "zoom.us")
   - **Regex**: Full regular expression support with capture groups

2. **Pattern Management**:
   - Set priority (lower numbers are checked first)
   - Assign custom field names
   - Delete patterns you don't need
   - Reset to defaults if needed
   - Real-time validation for regex patterns

#### Accessing Extracted Data

**Legacy Support (Backward Compatible)**:

- `callUrl` and `callType` continue to work for existing templates
- These map to the first "Video Call URL" extraction for compatibility

**New Approach (Recommended)**:

- Use `extractedFields["Field Name"]` to access any extracted data
- Each field returns an array of all matching values
- Much more flexible and powerful than the legacy fields

**Example**:

```javascript
// Legacy approach (still works but limited)
if (event.callUrl) {
  // Only gets the first video call URL
}

// New approach (recommended)
const videoUrls = event.extractedFields["Video Call URLs"] || [];
const meetingIds = event.extractedFields["Meeting IDs"] || [];
const phoneNumbers = event.extractedFields["Phone Numbers"] || [];

// Handle multiple values
videoUrls.forEach(url => {
  // Process each video call URL
});
```

> **💡 Tip**: Consider migrating your templates to use `extractedFields` for more flexibility and to access all extracted data, not just the first match.

### Usage

Go to a daily note, use the `ICS: Import events` command.

For customizations not available to the formatting, use Dataview or Templater (see below). Likewise, if you want to automatically import events when you create your daily notes, you'll want to use one of those. If you have issues using Dataview or Templater, test that your calendar imports works using the `ICS: Import events` command as there's more error handling available there.

### Data view usage

You can also use a [Dataview](https://blacksmithgu.github.io/obsidian-dataview/) to add your events to your journal notes when they get created.

**The `getEvents()` method accepts flexible date inputs**: date strings (like "2025-03-01" or "March 1, 2025"), moment objects, or JavaScript Date objects. This makes it easy to work with whatever date format is most convenient for your use case.

For example, if you use the core Templates plugin you can add the following to add events to your daily note template:

```dataviewjs
// Simple string-based approach
var events = await app.plugins.getPlugin('ics').getEvents(dv.current().file.name);

// Or use a Date object for today's events
var events = await app.plugins.getPlugin('ics').getEvents(new Date());

// Or use moment for date manipulation
var events = await app.plugins.getPlugin('ics').getEvents(moment().add(1, 'day'));

var mdArray = [];
events.forEach((e) => {
  mdArray.push(`${e.time} ${e.summary} ${e.location}: ${e.description}`.trim())
})
dv.list(dv.array(mdArray))
```

You can see the available fields in the [Event interface](https://github.com/open-horizon-labs/obsidian-ics/blob/master/src/IEvent.ts).

### Templater

You can use [Templater](https://github.com/SilentVoid13/Templater) with flexible date inputs. The `getEvents()` method now accepts moment objects directly, so you don't need to convert them to strings:

```javascript
<%*
// Direct moment object usage (recommended)
var events = await app.plugins.getPlugin('ics').getEvents(moment(tp.file.title,'YYYYMMDD'));
events.sort((a,b) => a.utime - b.utime).forEach((e) => {
  tR+=`- [ ] ${e.time} ${e.summary} ${e.location? e.location : ''}\n`
})
%>
```

If you prefer to use string dates or need to handle different date formats, you can also do:

```javascript
<%*
// String format (also works)
var events = await app.plugins.getPlugin('ics').getEvents(moment(tp.file.title,'YYYYMMDD').format('YYYY-MM-DD'));
events.sort((a,b) => a.utime - b.utime).forEach((e) => {
  tR+=`- [ ] ${e.time} ${e.summary} ${e.location? e.location : ''}\n`
})
%>
```

See [advanced Templated usage example](https://github.com/open-horizon-labs/obsidian-ics/discussions/74#discussion-5779931) for an example that demonstrates more features.

You can see the available fields an the [Event interface](https://github.com/open-horizon-labs/obsidian-ics/blob/master/src/IEvent.ts).

#### Multi-day events

`time` and `endTime` are clock times, so they can't tell you that an event runs past midnight. Use `startDateTime`/`endDateTime` (ISO 8601) or `utime`/`endUtime` (Unix timestamps) when you need the full extent of an event:

```javascript
<%*
var events = await app.plugins.getPlugin('ics').getEvents(moment(tp.file.title,'YYYY-MM-DD'));
events.forEach((e) => {
  // For all-day events DTEND is exclusive, so the last day is one day earlier.
  const lastDay = moment(e.endDateTime).subtract(e.allDay ? 1 : 0, 'day');
  const spansDays = !moment(e.startDateTime).isSame(lastDay, 'day');
  const when = spansDays
    ? `${moment(e.startDateTime).format('MMM D')} – ${lastDay.format('MMM D')}`
    : e.time;
  tR += `- ${when} ${e.summary}\n`
})
%>
```

Note that an event only appears on days after its start day if **Show ongoing** is enabled for that calendar.

#### Date Ranges

`getEvents()` accepts any number of date inputs, so you can pass a whole range at once instead of calling it once per day. For example, to pull events for the next 7 days starting from the current daily note:

```javascript
<%*
const startDate = moment(tp.file.title, 'YYYY-MM-DD');
const daysToInclude = Array.from({ length: 7 }, (_, i) => startDate.clone().add(i, 'days'));
var events = await app.plugins.getPlugin('ics').getEvents(...daysToInclude);
events.sort((a,b) => a.utime - b.utime).forEach((e) => {
  tR+=`- [ ] ${e.time} ${e.summary} ${e.location? e.location : ''}\n`
})
%>
```

### Full Calendar

Or you can use [Full Calendar](https://github.com/obsidian-community/obsidian-full-calendar) to render a calendar view of your events. Here's an example of how you can use it:

```javascript
const { renderCalendar } = app.plugins.getPlugin("obsidian-full-calendar");
const thisWeek = Array.from({length: 7}).map((_, weekday) => moment().set({weekday}).format("YYYY-MM-DD"))
const icsPlugin = app.plugins.getPlugin('ics')
const events = (await icsPlugin.getEvents(...thisWeek))
    .map(event => ({
	    start: moment.unix(event.utime).toDate(),
	    end: moment.unix(event.endUtime).toDate(),
	    allDay: event.allDay,
	    title: event.summary,
	})
)
renderCalendar(this.container, {events}).render()
```

### Using BRAT

If you want to try out beta releases, you can use the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.

1. Install the BRAT plugin
    1. Open `Settings` -> `Community Plugins`
    2. Disable safe mode, if enabled
    3. *Browse*, and search for "BRAT"
    4. Install the latest version of **Obsidian42 - BRAT**
2. Open BRAT settings (`Settings` -> `BRAT`)
    1. Scroll to the `Beta Plugin List` section
    2. `Add Beta Plugin`
    3. Specify this repository: `open-horizon-labs/obsidian-ics`
3. Enable the `Amazing Marvin` plugin (`Settings` -> `Community Plugins`)

## Support

If you want to support my work, you can [buy me a coffee](https://www.buymeacoffee.com/muness)

## Contributions

- [DST fix](https://github.com/muness/obsidian-ics/pull/17) from @zakkolar
- [Readme improvements and release script cleanup](https://github.com/muness/obsidian-ics/pull/22) from @fcwheat
- [Export event getter function](https://github.com/muness/obsidian-ics/pull/33) @bvolkmer
- [Allow plugin to run on mobile](https://github.com/muness/obsidian-ics/pull/46) @TopherMan
- [Implement customizable output format for events](https://github.com/muness/obsidian-ics/pull/55) @GoBeromsu
- [Documenting Dataview usage](https://github.com/muness/obsidian-ics/issues/56#issuecomment-1746417368) @afonsoguerra
- [Vdir enhancements](https://github.com/cloud-atlas-ai/obsidian-ics/pull/131) @bpannier
- [Ensure recurrent flag is set correctly](https://github.com/cloud-atlas-ai/obsidian-ics/pull/158) for recurrence overrides @mikeh
- [Support multiple days](https://github.com/cloud-atlas-ai/obsidian-ics/pull/160) and document [Full Calendar](https://github.com/obsidian-community/obsidian-full-calendar) usage @ctrl-q

## Manual Installation

If for some reason you want to install the plugin manually:

1. Download the `obsidian-ics-[version].zip` release file from [releases](https://github.com/muness/obsidian-ics/releases).
2. Unpack the file. It should create a `obsidian-ics` folder.
3. Place the folder in your .obsidian/plugins directory
4. Activate the `ICS` plugin

## Local Development

1. To develop Obsidian plugins you need NodeJS and npm installed. Do that first.
2. `npm install`
3. Make the changes you want...
4. `npm run dev` will watch for changes and build the plugin to `dist/main.js`.
5. copy the `dist/main.js` (or `dist/main-debug.js` if you want the un-minified version) to your Obdisian vault plugin folder (`cp dist/main.js <vault>/.obsidian/plugins/ics/main.js`).
6. Reload the vault or use the [Hot Reload Plugin](https://github.com/pjeby/hot-reload).

### Testing

The plugin includes a test harness for recurring events and timezone handling to prevent regressions:

```bash
# Run all tests
npm test

# Run tests in watch mode (automatically re-runs when files change)
npm run test:watch
```

See `tests/README.md` for information about how to add new tests.
