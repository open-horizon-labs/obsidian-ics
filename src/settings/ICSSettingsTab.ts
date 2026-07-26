import ICSPlugin from "../main";
import {
  PluginSettingTab,
  Setting,
  App,
  ButtonComponent,
  Modal,
  TextComponent,
  DropdownComponent,
  Notice,
  moment,
} from "obsidian";

import {
  Calendar,
  DEFAULT_CALENDAR_FORMAT,
  FieldExtractionPattern,
  DEFAULT_FIELD_EXTRACTION_PATTERNS
} from "./ICSSettings";

export function getCalendarElement(
  icsName: string): HTMLElement {

  const calendarElement = createDiv({
    cls: `calendar calendar-${icsName}`,
  });
  calendarElement.createDiv({
    cls: `calendar-name ${icsName}`,
    text: icsName
  });

  return calendarElement;
}

export default class ICSSettingsTab extends PluginSettingTab {
  plugin: ICSPlugin;
  timeFormatExample = createEl('b');

  constructor(app: App, plugin: ICSPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // use this same format to create a description for the dataViewSyntax setting
  private timeFormattingDescription(): DocumentFragment {
    this.updateTimeFormatExample();

    const descEl = createFragment();
    descEl.appendText('Time format for events. HH:mm is 00:15. hh:mma is 12:15am.');
    descEl.appendText(' For more syntax, refer to ');
    descEl.appendChild(this.getMomentDocsLink());
    descEl.appendText('.');

    descEl.appendChild(createEl('p'));
    descEl.appendText('Your current time format syntax looks like this: ');
    descEl.appendChild(this.timeFormatExample);
    descEl.appendText('.');
    return descEl;
  }

  private getMomentDocsLink(): HTMLAnchorElement {
    const a = createEl('a');
    a.href = 'https://momentjs.com/docs/#/displaying/format/';
    a.text = 'format reference';
    a.target = '_blank';
    return a;
  }

  private updateTimeFormatExample() {
    this.timeFormatExample.innerText = moment(new Date()).format(this.plugin.data.format.timeFormat);
  }

  private displayFieldExtractionPatterns(containerEl: HTMLElement) {
    const patternsContainer = containerEl.createDiv("field-extraction-patterns");

    // Ensure patterns exist, use defaults if not
    if (!this.plugin.data.fieldExtraction?.patterns) {
      if (!this.plugin.data.fieldExtraction) {
        this.plugin.data.fieldExtraction = {
          enabled: true,
          patterns: DEFAULT_FIELD_EXTRACTION_PATTERNS
        };
      } else {
        this.plugin.data.fieldExtraction.patterns = DEFAULT_FIELD_EXTRACTION_PATTERNS;
      }
    }

    const patterns = this.plugin.data.fieldExtraction.patterns;

    // Add field section management
    new Setting(patternsContainer)
      .setName("Add new")
      .setDesc("Add a new field section")
      .addButton((button: ButtonComponent): ButtonComponent => {
        const b = button
          .setTooltip("Add Additional")
          .setButtonText("+")
          .onClick(async () => {
            const modal = new FieldSectionModal(this.app, this.plugin);
            modal.onClose = () => {
              if (modal.saved) {
                // Refresh display to show new section
                this.display();
              }
            };
            modal.open();
          });

        return b;
      });

    // Group patterns by field name and display them as manageable sections
    const sortedPatterns = [...patterns].sort((a, b) => a.priority - b.priority);
    const groupedPatterns = new Map<string, FieldExtractionPattern[]>();

    // Group patterns by extracted field name
    sortedPatterns.forEach(pattern => {
      const fieldName = pattern.extractedFieldName;
      if (!groupedPatterns.has(fieldName)) {
        groupedPatterns.set(fieldName, []);
      }
      groupedPatterns.get(fieldName).push(pattern);
    });

    // Display each field section
    for (const [fieldName, fieldPatterns] of groupedPatterns) {
      // Field section header with management buttons
      new Setting(patternsContainer)
        .setName(`${fieldName} (${fieldPatterns.length} pattern${fieldPatterns.length === 1 ? '' : 's'})`)
        .setClass('field-section-header')
        .addExtraButton((b) => {
          b.setIcon("plus")
            .setTooltip("Add Pattern to this Field")
            .onClick(async () => {
              const modal = new FieldExtractionPatternModal(this.app, this.plugin, undefined, fieldName);
              modal.onClose = () => {
                void (async () => {
                  if (modal.saved) {
                    patterns.push(modal.pattern);
                    await this.plugin.saveSettings();
                    this.display();
                  }
                })();
              };
              modal.open();
            });
        })
        .addExtraButton((b) => {
          b.setIcon("pencil")
            .setTooltip("Edit Field Name")
            .onClick(async () => {
              const modal = new FieldSectionModal(this.app, this.plugin, fieldName);
              modal.onClose = () => {
                void (async () => {
                  if (modal.saved && modal.fieldName !== fieldName) {
                    // Update all patterns in this field to use the new field name
                    fieldPatterns.forEach(pattern => {
                      pattern.extractedFieldName = modal.fieldName;
                    });
                    await this.plugin.saveSettings();
                    this.display();
                  }
                })();
              };
              modal.open();
            });
        })
        .addExtraButton((b) => {
          b.setIcon("trash")
            .setTooltip("Delete Field Section")
            .onClick(() => {
              new ConfirmModal(
                this.app,
                `Are you sure you want to delete the "${fieldName}" field section? This will remove all ${fieldPatterns.length} pattern(s) in this section.`,
                (confirmed) => {
                  if (!confirmed) {
                    return;
                  }
                  void (async () => {
                    // Remove all patterns in this field section
                    fieldPatterns.forEach(pattern => {
                      const patternIndex = patterns.findIndex(p => p === pattern);
                      if (patternIndex !== -1) {
                        patterns.splice(patternIndex, 1);
                      }
                    });
                    await this.plugin.saveSettings();
                    this.display();
                  })();
                }
              ).open();
            });
        });

      // Display patterns in this field section
      fieldPatterns.forEach((pattern) => {
        const globalIndex = sortedPatterns.findIndex(p => p === pattern);
        const setting = new Setting(patternsContainer);

        setting.setName(pattern.name)
          .setDesc(`${pattern.matchType === 'regex' ? 'Regex' : 'Contains'}: ${pattern.pattern} (Priority: ${pattern.priority})`)
          .addExtraButton((b) => {
            b.setIcon("chevron-up")
              .setTooltip("Move Up (Higher Priority)")
              .setDisabled(globalIndex === 0)
              .onClick(async () => {
                if (globalIndex > 0) {
                  // Swap priorities with the previous pattern in global order
                  const prevPattern = sortedPatterns[globalIndex - 1];
                  const currentPriority = pattern.priority;
                  pattern.priority = prevPattern.priority;
                  prevPattern.priority = currentPriority;
                  await this.plugin.saveSettings();
                  this.display();
                }
              });
          })
          .addExtraButton((b) => {
            b.setIcon("chevron-down")
              .setTooltip("Move Down (Lower Priority)")
              .setDisabled(globalIndex === sortedPatterns.length - 1)
              .onClick(async () => {
                if (globalIndex < sortedPatterns.length - 1) {
                  // Swap priorities with the next pattern in global order
                  const nextPattern = sortedPatterns[globalIndex + 1];
                  const currentPriority = pattern.priority;
                  pattern.priority = nextPattern.priority;
                  nextPattern.priority = currentPriority;
                  await this.plugin.saveSettings();
                  this.display();
                }
              });
          })
          .addExtraButton((b) => {
            b.setIcon("pencil")
              .setTooltip("Edit")
              .onClick(() => {
                const modal = new FieldExtractionPatternModal(this.app, this.plugin, pattern);
                modal.onClose = () => {
                  void (async () => {
                    if (modal.saved) {
                      const originalIndex = patterns.findIndex(p => p === pattern);
                      if (originalIndex !== -1) {
                        patterns[originalIndex] = modal.pattern;
                        await this.plugin.saveSettings();
                        this.display();
                      }
                    }
                  })();
                };
                modal.open();
              });
          })
          .addExtraButton((b) => {
            b.setIcon("trash")
              .setTooltip("Delete")
              .onClick(async () => {
                const patternIndex = patterns.findIndex(p => p === pattern);
                if (patternIndex !== -1) {
                  patterns.splice(patternIndex, 1);
                  await this.plugin.saveSettings();
                  this.display();
                }
              });
          });
      });
    }
  }

  private displayFieldExtractionReset(containerEl: HTMLElement) {
    // Reset to defaults button - positioned outside patterns to show it affects all patterns
    new Setting(containerEl)
      .setName("Reset to Defaults")
      .setDesc("Reset all field extraction patterns to default video call providers")
      .addButton((button: ButtonComponent): ButtonComponent => {
        return button
          .setButtonText("Reset All")
          .setWarning()
          .onClick(() => {
            new ConfirmModal(
              this.app,
              "Are you sure you want to reset all field extraction patterns to defaults? This will delete all your custom patterns and cannot be undone.",
              (confirmed) => {
                if (!confirmed) {
                  return;
                }
                void (async () => {
                  this.plugin.data.fieldExtraction.patterns = [...DEFAULT_FIELD_EXTRACTION_PATTERNS];
                  await this.plugin.saveSettings();
                  this.display();
                })();
              }
            ).open();
          });
      });
  }

  private dataViewSyntaxDescription(): DocumentFragment {
    const descEl = createFragment();
    descEl.appendText('Enable this option if you use the DataView plugin to query event start and end times.');
    return descEl;
  }

  display(): void {
    const {
      containerEl
    } = this;

    containerEl.empty();

    // Calendars Section
    this.displayCalendarsSection(containerEl);

    // Output Format Section
    this.displayFormatSection(containerEl);

    // Field Extraction Section
    this.displayFieldExtractionSection(containerEl);

    // Sponsor link - Thank you!
    const divSponsor = containerEl.createDiv();
    divSponsor.createEl('br');
    divSponsor.createEl('hr');
    divSponsor.appendText('A scratch my own itch project by ');
    const munessLink = divSponsor.createEl('a', { text: 'muness' });
    munessLink.href = 'https://muness.com/';
    munessLink.target = '_blank';
    divSponsor.appendText('.');
    divSponsor.createEl('br');
    const coffeeLink = divSponsor.createEl('a');
    coffeeLink.href = 'https://www.buymeacoffee.com/muness';
    coffeeLink.target = '_blank';
    const coffeeImg = coffeeLink.createEl('img');
    coffeeImg.height = 36;
    coffeeImg.src = 'https://cdn.buymeacoffee.com/uploads/profile_pictures/default/79D6B5/MC.png';
    coffeeImg.setAttribute('border', '0');
    coffeeImg.alt = 'Buy Me a Book';
  }


  private displayCalendarsSection(containerEl: HTMLElement): void {
    // Section heading
    new Setting(containerEl)
      .setHeading()
      .setName("Calendars");

    const calendarContainer = containerEl.createDiv(
      "ics-setting-calendar"
    );

    new Setting(calendarContainer)
      .setName("Add new")
      .setDesc("Add a new calendar")
      .addButton((button: ButtonComponent): ButtonComponent => {
        const b = button
          .setTooltip("Add Additional")
          .setButtonText("+")
          .onClick(async () => {
            const modal = new SettingsModal(this.app, this.plugin);

            modal.onClose = () => {
              if (modal.saved) {
                void this.plugin.addCalendar({
                  icsName: modal.icsName,
                  icsUrl: modal.icsUrl,
                  ownerEmail: modal.ownerEmail,
                  format: modal.format,
                  calendarType: modal.calendarType as 'remote' | 'vdir',
                });
                this.display();
              }
            };

            modal.open();
          });

        return b;
      });

    const additional = calendarContainer.createDiv("calendar");

    const sortedCalendarKeys = Object.keys(this.plugin.data.calendars).sort();
    for (const calendarKey of sortedCalendarKeys) {
      const calendar = this.plugin.data.calendars[calendarKey];
      const setting = new Setting(additional);

      const calEl = getCalendarElement(
        calendar.icsName);
      setting.infoEl.replaceWith(calEl);

      setting
        .addExtraButton((b) => {
          b.setIcon("pencil")
            .setTooltip("Edit")
            .onClick(() => {
              const modal = new SettingsModal(this.app, this.plugin, calendar);

              modal.onClose = () => {
                if (modal.saved) {
                  void this.plugin.removeCalendar(calendar);
                  void this.plugin.addCalendar({
                    icsName: modal.icsName,
                    icsUrl: modal.icsUrl,
                    ownerEmail: modal.ownerEmail,
                    format: modal.format,
                    calendarType: modal.calendarType as 'remote' | 'vdir',
                  });
                  this.display();
                }
              };

              modal.open();
            });
        })
        .addExtraButton((b) => {
          b.setIcon("trash")
            .setTooltip("Delete")
            .onClick(() => {
              new ConfirmModal(
                this.app,
                `Are you sure you want to delete the calendar "${calendar.icsName}"? This cannot be undone.`,
                (confirmed) => {
                  if (!confirmed) {
                    return;
                  }
                  void (async () => {
                    await this.plugin.removeCalendar(calendar);
                    this.display();
                  })();
                }
              ).open();
            });
        });
    }
  }

  private displayFormatSection(containerEl: HTMLElement): void {
    // Section heading
    new Setting(containerEl)
      .setHeading()
      .setName("Output Format");

    let timeFormat: TextComponent;
    new Setting(containerEl)
      .setName("Time format")
      .setDesc(this.timeFormattingDescription())
      .addText((text) => {
        timeFormat = text;
        timeFormat.setValue(this.plugin.data.format.timeFormat).onChange(async (v) => {
          this.plugin.data.format.timeFormat = v;
          this.updateTimeFormatExample();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('DataView Metadata syntax for start and end times')
      .setDesc(this.dataViewSyntaxDescription())
      .addToggle(toggle => toggle
        .setValue(this.plugin.data.format.dataViewSyntax || false)
        .onChange(async (v) => {
          this.plugin.data.format.dataViewSyntax = v;
          await this.plugin.saveSettings();
        }));
  }

  private displayFieldExtractionSection(containerEl: HTMLElement): void {
    // Section heading
    new Setting(containerEl)
      .setHeading()
      .setName("Field Extraction");

    // Enable/disable toggle
    new Setting(containerEl)
      .setName('Enable Field Extraction')
      .setDesc('Extract custom fields from calendar events using patterns')
      .addToggle(toggle => toggle
        .setValue(this.plugin.data.fieldExtraction?.enabled ?? true)
        .onChange(async (v) => {
          if (!this.plugin.data.fieldExtraction) {
            this.plugin.data.fieldExtraction = {
              enabled: v,
              patterns: DEFAULT_FIELD_EXTRACTION_PATTERNS
            };
          } else {
            this.plugin.data.fieldExtraction.enabled = v;
          }
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide patterns section
        }));

    // Only show patterns section and related UI if enabled
    if (this.plugin.data.fieldExtraction?.enabled !== false) {
      // Add Templater example button
      new Setting(containerEl)
        .setName("Templater Example")
        .setDesc("Show example code for using extracted fields with Templater")
        .addButton((button: ButtonComponent): ButtonComponent => {
          return button
            .setButtonText("Show Example")
            .setIcon("code")
            .onClick(() => {
              const modal = new TemplaterExampleModal(this.app, this.plugin);
              modal.open();
            });
        });

      // Add some whitespace below the usage area
      containerEl.createDiv('ics-spacer-bottom');

      this.displayFieldExtractionPatterns(containerEl);

      // Add visual separation and reset button
      containerEl.createDiv('ics-spacer-top');
      this.displayFieldExtractionReset(containerEl);
    }
  }

}

// Obsidian ships a built-in ConfirmationModal, but only since 1.13.0 - using
// it would raise this plugin's minAppVersion far beyond its current 1.9.12.
// This is a minimal, backward-compatible replacement for the native confirm()
// dialog the Obsidian review guidelines flag.
class ConfirmModal extends Modal {
  constructor(app: App, private message: string, private onConfirm: (confirmed: boolean) => void) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('p', { text: this.message });

    const footerEl = contentEl.createDiv();
    const footerButtons = new Setting(footerEl);
    footerButtons.addButton((b) => {
      b.setButtonText("Confirm")
        .setWarning()
        .onClick(() => {
          this.onConfirm(true);
          this.close();
        });
      return b;
    });
    footerButtons.addExtraButton((b) => {
      b.setTooltip("Cancel")
        .setIcon("cross")
        .onClick(() => {
          this.onConfirm(false);
          this.close();
        });
      return b;
    });
  }
}

class SettingsModal extends Modal {
  plugin: ICSPlugin;
  icsName: string = "";
  icsUrl: string = "";
  urlSetting: Setting;
  nameText: TextComponent;
  urlText: TextComponent;
  urlDropdown: DropdownComponent;
  ownerEmail: string = "";
  private originalIcsName: string = "";

  saved: boolean = false;
  error: boolean = false;
  private hasChanges: boolean = false;

  format: {
    checkbox: boolean,
    includeEventEndTime: boolean,
    icsName: boolean,
    summary: boolean,
    location: boolean,
    description: boolean,
    showAttendees: boolean,
    showOngoing: boolean,
    showTransparentEvents: boolean,
  } = DEFAULT_CALENDAR_FORMAT;
  calendarType: string;
  constructor(app: App, plugin: ICSPlugin, setting?: Calendar) {
    super(app);
    this.plugin = plugin;
    if (setting) {
      this.icsName = setting.icsName;
      this.originalIcsName = setting.icsName;
      this.icsUrl = setting.icsUrl;
      this.ownerEmail = setting.ownerEmail;
      this.format = setting.format;
      this.calendarType = setting.calendarType || 'remote';
    }
  }


  listIcsDirectories(): string[] {
    const icsFiles = this.app.vault.getFiles().filter(f => f.extension === "ics");
    const directories = new Set(icsFiles.map(f => f.parent.path));
    return Array.from(directories);
  }

  display() {
    const {
      contentEl
    } = this;

    contentEl.empty();

    const settingDiv = contentEl.createDiv({ cls: 'ics-settings' });

    new Setting(settingDiv)
      .setName("Calendar Name")
      .addText((text) => {
        this.nameText = text;
        text.setValue(this.icsName).onChange((v) => {
          this.icsName = v;
          this.hasChanges = true;
          this.validateName(text);
        });
      });

    new Setting(settingDiv)
      .setName('Calendar Owner Email (Optional)')
      .setDesc('Used to skip declined events')
      .addText(text => {
        text.setValue(this.ownerEmail).onChange(value => {
          this.ownerEmail = value;
          this.hasChanges = true;
        });
      });

    new Setting(settingDiv)
      .setName('Calendar Type')
      .setDesc('Select the type of calendar (Remote URL or Vault Folder with ICS files, maintained manually or via automation like vdirsyncer)')
      .addDropdown(dropdown => {
        dropdown.addOption('remote', 'Remote URL');
        dropdown.addOption('vdir', 'Folder with ICS files');
        dropdown.setValue(this.calendarType)
          .onChange(value => {
            this.calendarType = value;
            updateUrlSetting();
          });
      });

    const urlSettingDiv = settingDiv.createDiv({ cls: 'url-setting-container' });

    // Function to update URL setting
    const updateUrlSetting = () => {
      // First, remove the existing URL setting if it exists
      settingDiv.querySelectorAll('.url-setting').forEach(el => el.remove());

      const urlSetting = new Setting(urlSettingDiv)
         .setDesc(this.calendarType === 'vdir' ? 'Select the folder containing ICS files. Must be in the current Obdidian Vault and have at least one ics.' : 'Enter the URL of the calendar')
        .setName(this.calendarType === 'vdir' ? 'Vault Folder' : 'Calendar URL');
      urlSetting.settingEl.addClass('url-setting');

      if (this.calendarType === 'vdir') {
        // If vdir, add a dropdown
        urlSetting.addDropdown(dropdown => {
          const directories = this.listIcsDirectories();
          directories.forEach(dir => {
            dropdown.addOption(dir, dir);
          });
          dropdown.setValue(this.icsUrl).onChange(value => {
            this.icsUrl = value;
            this.hasChanges = true;
          });
        });
      } else {
        // If remote, add a text input
        urlSetting.addText(text => {
          this.urlText = text;
          text.setValue(this.icsUrl).onChange(value => {
            this.icsUrl = value;
            this.hasChanges = true
            this.validateUrl(text);
          });
        });
      }
    };

    // Call updateUrlSetting initially
    updateUrlSetting();

    new Setting(settingDiv)
      .setHeading().setName("Output Format");

    // set each of the calendar format settings to the default if it's undefined
    for (const f in DEFAULT_CALENDAR_FORMAT) {
      if (this.format[f] == undefined) {
        this.format[f] = DEFAULT_CALENDAR_FORMAT[f];
      }
    }

    new Setting(settingDiv)
      .setName('Checkbox')
      .setDesc('Use a checkbox for each event (will be a bullet otherwise)')
      .addToggle(toggle => toggle
        .setValue(this.format.checkbox)
        .onChange(value => {
          this.format.checkbox = value
          this.hasChanges = true;
        }));

    new Setting(settingDiv)
      .setName('End time')
      .setDesc('Include the event\'s end time')
      .addToggle(toggle => toggle
        .setValue(this.format.includeEventEndTime)
        .onChange(value => {
          this.format.includeEventEndTime = value;
          this.hasChanges = true;
        }));

    new Setting(settingDiv)
      .setName('Calendar name')
      .setDesc('Include the calendar name')
      .addToggle(toggle => toggle
        .setValue(this.format.icsName)
        .onChange(value => {
          this.format.icsName = value
          this.hasChanges = true;
        }));

    new Setting(settingDiv)
      .setName('Summary')
      .setDesc('Include the summary field')
      .addToggle(toggle => toggle
        .setValue(this.format.summary)
        .onChange(value => {
          this.format.summary = value;
          this.hasChanges = true;
        }));

    new Setting(settingDiv)
      .setName('Location')
      .setDesc('Include the location field')
      .addToggle(toggle => toggle
        .setValue(this.format.location)
        .onChange(value => {
          this.format.location = value;
          this.hasChanges = true;
        }));

    new Setting(settingDiv)
      .setName('Description')
      .setDesc('Include the description field ')
      .addToggle(toggle => toggle
        .setValue(this.format.description)
        .onChange(value => {
          this.format.description = value
          this.hasChanges = true;
        }));

    new Setting(settingDiv)
      .setName('Show Attendees')
      .setDesc('Display attendees for the event')
      .addToggle(toggle => toggle
        .setValue(this.format.showAttendees)
        .onChange(value => {
          this.format.showAttendees = value;
          this.hasChanges = true;
        }));

    new Setting(settingDiv)
      .setName('Show Ongoing')
      .setDesc('Display multi-day events that include target date')
      .addToggle(toggle => toggle
        .setValue(this.format.showOngoing)
        .onChange(value => {
          this.format.showOngoing = value;
          this.hasChanges = true;
        }));

    new Setting(settingDiv)
      .setName("Include 'Available' Events")
      .setDesc("Display events marked as 'Available' (do not block time) in the calendar. These are also referred to as 'Transparent' events.")
      .addToggle(toggle => toggle
        .setValue(this.format.showTransparentEvents)
        .onChange(value => {
          this.format.showTransparentEvents = value;
          this.hasChanges = true;
        }));

    const footerEl = contentEl.createDiv();
    const footerButtons = new Setting(footerEl);
    footerButtons.addButton((b) => {
      b.setTooltip("Save")
        .setIcon("save")
        .onClick(async () => {
          const nameValid = this.validateName(this.nameText);
          const urlValid = this.validateUrl(this.calendarType === 'vdir' ? undefined : this.urlText);
          if (!nameValid || !urlValid) {
            return;
          }
          this.icsName = this.icsName.trim();
          await this.plugin.saveSettings();
          this.saved = true;
          this.hasChanges = false;
          this.close();
        });
      return b;
    });
    footerButtons.addExtraButton((b) => {
      b.setTooltip("Cancel")
        .setIcon("cross")
        .onClick(() => {
          this.saved = false;
          this.close();
        });
      return b;
    });
  }

  private validateName(textInput?: TextComponent): boolean {
    const trimmed = this.icsName.trim();

    if (!trimmed) {
      if (textInput) {
        SettingsModal.setValidationError(textInput, "Calendar name is required");
      }
      return false;
    }

    const isDuplicate = Object.keys(this.plugin.data.calendars).some(
      key => key !== this.originalIcsName && key === trimmed
    );
    if (isDuplicate) {
      if (textInput) {
        SettingsModal.setValidationError(textInput, "A calendar with this name already exists");
      }
      return false;
    }

    if (textInput) {
      SettingsModal.removeValidationError(textInput);
    }
    return true;
  }

  private validateUrl(textInput?: TextComponent): boolean {
    const value = this.icsUrl.trim();

    if (this.calendarType === 'vdir') {
      const isValid = value !== '';
      if (!isValid) {
        new Notice("Select a vault folder for this calendar.");
      }
      return isValid;
    }

    const isValid = /^https?:\/\/.+/i.test(value);
    if (textInput) {
      if (isValid) {
        SettingsModal.removeValidationError(textInput);
      } else {
        SettingsModal.setValidationError(
          textInput,
          "Calendar URL is required and must start with http:// or https://"
        );
      }
    }
    return isValid;
  }

  onOpen() {
    this.display();
  }

  close() {
    if (this.hasChanges) {
      new ConfirmModal(this.app, 'You have unsaved changes. Are you sure you want to discard them?', (confirmed) => {
        if (!confirmed) {
          return;
        }
        void (async () => {
          await this.plugin.loadSettings();
          super.close();
        })();
      }).open();
      return; // Don't close yet - wait for the confirmation modal
    }
    super.close();
  }

  static setValidationError(textInput: TextComponent, message?: string) {
    textInput.inputEl.addClass("is-invalid");
    if (message) {
      textInput.inputEl.parentElement.addClasses([
        "has-invalid-message",
        "unset-align-items"
      ]);
      textInput.inputEl.parentElement.parentElement.addClass(
        "unset-align-items"
      );
      let mDiv = textInput.inputEl.parentElement.querySelector(
        ".invalid-feedback"
      ) as HTMLDivElement;

      if (!mDiv) {
        mDiv = createDiv({
          cls: "invalid-feedback"
        });
        // insertAfter(node, child) inserts `node` into the element it's
        // called on, positioned after `child`. Must be called on the
        // parent, not on mDiv itself - calling it on mDiv would move
        // textInput.inputEl into this (detached) div instead of placing
        // mDiv after the input in the actual settings row.
        textInput.inputEl.parentElement.insertAfter(mDiv, textInput.inputEl);
      }
      mDiv.innerText = message;
    }
  }
  static removeValidationError(textInput: TextComponent) {
    textInput.inputEl.removeClass("is-invalid");
    textInput.inputEl.parentElement.removeClasses([
      "has-invalid-message",
      "unset-align-items"
    ]);
    textInput.inputEl.parentElement.parentElement.removeClass(
      "unset-align-items"
    );

    if (textInput.inputEl.parentElement.children[1]) {
      textInput.inputEl.parentElement.removeChild(
        textInput.inputEl.parentElement.children[1]
      );
    }
  }
}

class FieldExtractionPatternModal extends Modal {
  plugin: ICSPlugin;
  pattern: FieldExtractionPattern;
  saved: boolean = false;
  private hasChanges: boolean = false;
  private nameText: TextComponent;
  private patternText: TextComponent;
  private priorityHasError: boolean = false;

  constructor(app: App, plugin: ICSPlugin, pattern?: FieldExtractionPattern, defaultFieldName?: string) {
    super(app);
    this.plugin = plugin;

    if (pattern) {
      // Editing existing pattern
      this.pattern = { ...pattern };
    } else {
      // Creating new pattern
      const maxPriority = Math.max(...(this.plugin.data.fieldExtraction?.patterns.map(p => p.priority) || [0]));
      this.pattern = {
        name: "",
        pattern: "",
        matchType: "contains",
        priority: maxPriority + 1,
        extractedFieldName: defaultFieldName || "Video Call URLs"
      };
    }
  }

  display() {
    const { contentEl } = this;
    contentEl.empty();

    const settingDiv = contentEl.createDiv({ cls: 'video-call-pattern-settings' });

    // Add Esc key handling to close modal
    contentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    // Pattern name
    new Setting(settingDiv)
      .setName("Pattern Name")
      .setDesc("Descriptive name for this pattern")
      .addText((text) => {
        this.nameText = text;
        text.setValue(this.pattern.name).onChange((v) => {
          this.pattern.name = v;
          this.hasChanges = true;
          this.validateName();
        });
      });


    // Match type
    new Setting(settingDiv)
      .setName("Match Type")
      .setDesc("How to match the pattern")
      .addDropdown(dropdown => {
        dropdown.addOption('contains', 'Contains');
        dropdown.addOption('regex', 'Regular Expression');
        dropdown.setValue(this.pattern.matchType)
          .onChange(value => {
            this.pattern.matchType = value as 'regex' | 'contains';
            this.hasChanges = true;
          });
      });

    // Pattern
    new Setting(settingDiv)
      .setName("Pattern")
      .setDesc("The text or regex pattern to match in event location/description")
      .addText((text) => {
        this.patternText = text;
        text.setValue(this.pattern.pattern).onChange((v) => {
          this.pattern.pattern = v;
          this.hasChanges = true;
          this.validatePattern();
        });
      });

    // Priority
    new Setting(settingDiv)
      .setName("Priority")
      .setDesc("Lower numbers have higher priority (checked first)")
      .addText((text) => {
        text.setValue(this.pattern.priority.toString()).onChange((v) => {
          this.hasChanges = true;
          const priority = parseInt(v);
          if (isNaN(priority)) {
            this.priorityHasError = true;
            SettingsModal.setValidationError(text, "Priority must be a number");
            return;
          }
          this.priorityHasError = false;
          SettingsModal.removeValidationError(text);
          this.pattern.priority = priority;
        });
        text.inputEl.addEventListener('blur', () => {
          // Invalid input never made it into this.pattern.priority, so
          // resync the displayed text to what's actually saved.
          text.setValue(this.pattern.priority.toString());
          this.priorityHasError = false;
          SettingsModal.removeValidationError(text);
        });
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (this.validateForm()) {
              this.saved = true;
              this.hasChanges = false;
              this.close();
            }
          }
        });
      });

    // Footer buttons
    const footerEl = contentEl.createDiv();
    const footerButtons = new Setting(footerEl);
    footerButtons.addButton((b) => {
      b.setTooltip("Save")
        .setIcon("save")
        .onClick(async () => {
          if (this.validateForm()) {
            this.pattern.name = this.pattern.name.trim();
            this.saved = true;
            this.hasChanges = false;
            this.close();
          }
        });
      return b;
    });
    footerButtons.addExtraButton((b) => {
      b.setTooltip("Cancel")
        .setIcon("cross")
        .onClick(() => {
          this.saved = false;
          this.close();
        });
      return b;
    });
  }

  private validateName(): boolean {
    if (!this.pattern.name.trim()) {
      if (this.nameText) {
        SettingsModal.setValidationError(this.nameText, "Pattern name is required");
      }
      return false;
    }
    if (this.nameText) {
      SettingsModal.removeValidationError(this.nameText);
    }
    return true;
  }

  private validatePattern(): boolean {
    if (!this.pattern.pattern.trim()) {
      if (this.patternText) {
        SettingsModal.setValidationError(this.patternText, "Pattern is required");
      }
      return false;
    }
    if (this.pattern.matchType === 'regex') {
      try {
        new RegExp(this.pattern.pattern);
      } catch {
        if (this.patternText) {
          SettingsModal.setValidationError(this.patternText, "Invalid regular expression");
        }
        return false;
      }
    }
    if (this.patternText) {
      SettingsModal.removeValidationError(this.patternText);
    }
    return true;
  }

  private validateForm(): boolean {
    const nameValid = this.validateName();
    const patternValid = this.validatePattern();
    return nameValid && patternValid && !this.priorityHasError;
  }

  onOpen() {
    this.display();
  }

  close() {
    if (this.hasChanges) {
      new ConfirmModal(this.app, 'You have unsaved changes. Are you sure you want to discard them?', (confirmed) => {
        if (confirmed) {
          super.close();
        }
      }).open();
      return; // Don't close yet - wait for the confirmation modal
    }
    super.close();
  }
}

class FieldSectionModal extends Modal {
  plugin: ICSPlugin;
  fieldName: string = "";
  saved: boolean = false;
  private hasChanges: boolean = false;
  private isEditing: boolean = false;
  private originalFieldName: string = "";
  private fieldNameText: TextComponent;

  constructor(app: App, plugin: ICSPlugin, existingFieldName?: string) {
    super(app);
    this.plugin = plugin;

    if (existingFieldName) {
      this.isEditing = true;
      this.fieldName = existingFieldName;
      this.originalFieldName = existingFieldName;
    }
  }

  display() {
    const { contentEl } = this;
    contentEl.empty();

    // Add Esc key handling to close modal
    contentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    // Modal title at the top
    const titleEl = contentEl.createEl('h3', { cls: 'modal-title' });
    titleEl.textContent = this.isEditing ? 'Edit Field Section' : 'Create Field Section';

    const settingDiv = contentEl.createDiv({ cls: 'field-section-settings' });

    // Field name input
    new Setting(settingDiv)
      .setName("Field Name")
      .setDesc(this.isEditing
        ? `Rename this field section. All patterns will be updated to use the new name.`
        : "Name for the field section (e.g., 'Phone Numbers', 'Meeting IDs', 'Video Call URLs').")
      .addText((text) => {
        this.fieldNameText = text;
        text.setValue(this.fieldName).onChange((v) => {
          this.fieldName = v;
          this.hasChanges = true;
          this.validateFieldName();
        });
      });

    // Add backward compatibility tip
    const tipEl = settingDiv.createDiv('field-name-tip');
    const tipP1 = tipEl.createEl('p');
    tipP1.createEl('strong', { text: '💡 Backward Compatibility Tip:' });
    tipP1.appendText(' The field name "Video Call URLs" automatically populates the legacy ');
    tipP1.createEl('code', { text: 'callUrl' });
    tipP1.appendText(' and ');
    tipP1.createEl('code', { text: 'callType' });
    tipP1.appendText(' properties for existing templates.');
    const tipP2 = tipEl.createEl('p');
    tipP2.appendText('For new templates, use ');
    tipP2.createEl('code', { text: 'event.extractedFields["Field Names"]' });
    tipP2.appendText(" to access any field's extracted data.");

    // Footer buttons
    const footerEl = contentEl.createDiv();
    const footerButtons = new Setting(footerEl);
    footerButtons.addButton((b) => {
      const buttonText = this.isEditing ? "Save Changes" : "Create Section";
      const buttonIcon = this.isEditing ? "check" : "plus";

      b.setTooltip(buttonText)
        .setIcon(buttonIcon)
        .onClick(async () => {
          if (this.validateForm()) {
            this.fieldName = this.fieldName.trim();
            if (this.isEditing) {
              // Just save - the calling code will handle updating patterns
              this.saved = true;
              this.hasChanges = false;
              this.close();
            } else {
              // Create a default pattern for this field section
              const maxPriority = Math.max(...(this.plugin.data.fieldExtraction?.patterns.map(p => p.priority) || [0]));
              const defaultPattern: FieldExtractionPattern = {
                name: `${this.fieldName} Pattern`,
                pattern: "",
                matchType: "contains",
                priority: maxPriority + 1,
                extractedFieldName: this.fieldName
              };

              this.plugin.data.fieldExtraction.patterns.push(defaultPattern);
              await this.plugin.saveSettings();

              this.saved = true;
              this.hasChanges = false;
              this.close();
            }
          }
        });
      return b;
    });
    footerButtons.addExtraButton((b) => {
      b.setTooltip("Cancel")
        .setIcon("cross")
        .onClick(() => {
          this.saved = false;
          this.close();
        });
      return b;
    });
  }

  private validateFieldName(): boolean {
    if (!this.fieldName.trim()) {
      if (this.fieldNameText) {
        SettingsModal.setValidationError(this.fieldNameText, "Field name is required");
      }
      return false;
    }
    if (this.fieldNameText) {
      SettingsModal.removeValidationError(this.fieldNameText);
    }
    return true;
  }

  private validateForm(): boolean {
    return this.validateFieldName();
  }

  onOpen() {
    this.display();
  }

  close() {
    if (this.hasChanges) {
      new ConfirmModal(this.app, 'You have unsaved changes. Are you sure you want to discard them?', (confirmed) => {
        if (confirmed) {
          super.close();
        }
      }).open();
      return; // Don't close yet - wait for the confirmation modal
    }
    super.close();
  }
}

class TemplaterExampleModal extends Modal {
  plugin: ICSPlugin;

  constructor(app: App, plugin: ICSPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    this.display();
  }

  display() {
    const { contentEl } = this;
    contentEl.empty();

    // Modal title
    const titleEl = contentEl.createEl('h3', { cls: 'modal-title' });
    titleEl.textContent = 'Templater Example';

    const settingDiv = contentEl.createDiv({ cls: 'field-section-settings' });

    // Get unique field names from patterns
    const patterns = this.plugin.data.fieldExtraction?.patterns || [];
    const fieldNames = [...new Set(patterns.map(p => p.extractedFieldName))].filter(Boolean);

    // Generate dynamic Templater code based on user's configured fields
    const extractedFieldsCode = fieldNames.length > 0
      ? fieldNames.map(fieldName => `    const ${this.camelCase(fieldName)} = event.extractedFields["${fieldName}"] || [];`).join('\n')
      : '    // No custom fields configured yet - add field sections to see them here';

    const fieldDisplayCode = fieldNames.length > 0
      ? fieldNames.map(fieldName => {
          const camelCased = this.camelCase(fieldName);
          return `    if (${camelCased}.length > 0) {
        tR += \`    - ${fieldName}:: \${${camelCased}.join(", ")}\\n\`;
    }`;
        }).join('\n')
      : '    // Field display code will appear here when you add field sections';

    const templaterCode = `<%*
const events = await app.plugins.getPlugin('ics').getEvents(moment(tp.file.title,"YYYY-MM-DD"));
events.sort((a, b) => a.utime - b.utime).forEach((event) => {
    const { time, endTime, summary, icsName, callUrl, callType, location, attendees, description } = event;

    // Extract custom fields
${extractedFieldsCode}

    // Format attendees
    const attendeeList = attendees ? attendees.map(attendee => \`[\${attendee.name}](mailto:\${attendee.email})\`).join(", ") : '';

    // Main event line
    tR += \`- [ ] \${time}-\${endTime} **\${summary}** \${icsName}\\n\`;

    // Add extracted fields as indented metadata
${fieldDisplayCode}

    // Add attendees if present
    if (attendeeList) {
        tR += \`    - Attendees:: \${attendeeList}\\n\`;
    }
});
%>`;

    // Description
    new Setting(settingDiv)
      .setName("How to use with Templater")
      .setDesc(`This example shows how to use extracted fields in your Templater templates. ${fieldNames.length > 0 ? `Based on your current field sections: ${fieldNames.join(', ')}` : 'Add field sections to see them reflected in the code below.'}`);

    // Code display area
    const codeContainer = settingDiv.createDiv('compatibility-note');
    const codeEl = codeContainer.createEl('pre', { cls: 'ics-templater-code' });
    codeEl.textContent = templaterCode;

    // Copy button
    new Setting(settingDiv)
      .addButton((button: ButtonComponent): ButtonComponent => {
        return button
          .setButtonText("Copy to Clipboard")
          .setIcon("copy")
          .onClick(async () => {
            await navigator.clipboard.writeText(templaterCode);
            button.setButtonText("Copied!");
            window.setTimeout(() => {
              button.setButtonText("Copy to Clipboard");
            }, 2000);
          });
      });

    // Usage note
    const usageNote = settingDiv.createDiv('field-name-tip');
    const usageP = usageNote.createEl('p');
    usageP.createEl('strong', { text: '💡 Usage:' });
    usageP.appendText(" Copy this code into your Templater template file. It will automatically use any field sections you've configured.");

    // Close button
    new Setting(settingDiv)
      .addButton((button: ButtonComponent): ButtonComponent => {
        return button
          .setButtonText("Close")
          .onClick(() => this.close());
      });
  }

  private camelCase(str: string): string {
    return str
      .replace(/\s+/g, '') // Remove spaces
      .replace(/[^a-zA-Z0-9]/g, '') // Remove special characters
      .replace(/^./, c => c.toLowerCase()); // Make first letter lowercase
  }
}
