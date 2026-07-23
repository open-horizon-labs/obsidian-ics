import { moment } from "obsidian";

// Type for flexible date input
export type FlexibleDateInput = string | moment.Moment | Date;

/**
 * Handles normalization of various date input types to standardized string format
 */
export class DateNormalizer {
  /**
   * Normalizes a single date input to YYYY-MM-DD string format
   * @param dateInput - Can be a string, moment object, or Date object
   * @returns Normalized date string in YYYY-MM-DD format
   * @throws Error if the input is invalid or unsupported
   */
  static normalizeDateInput(this: void, dateInput: FlexibleDateInput): string {
    if (dateInput === null || dateInput === undefined) {
      throw new Error("Date input cannot be null or undefined");
    }

    // Handle moment objects
    if (moment.isMoment(dateInput)) {
      return dateInput.format('YYYY-MM-DD');
    }

    // Handle Date objects
    if (dateInput instanceof Date) {
      return moment(dateInput).format('YYYY-MM-DD');
    }

    // Handle strings
    if (typeof dateInput === 'string') {
      // If already in YYYY-MM-DD format, return as-is
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        return dateInput;
      }
      
      // Try to parse the string with moment
      const parsed = moment(dateInput);
      if (parsed.isValid()) {
        return parsed.format('YYYY-MM-DD');
      }
      
      throw new Error(`Invalid date string: ${dateInput}`);
    }

    throw new Error(`Unsupported date input type: ${typeof dateInput}`);
  }

  /**
   * Normalizes an array of flexible date inputs to YYYY-MM-DD string format
   * @param dateInputs - Array of dates in various formats
   * @returns Array of normalized date strings in YYYY-MM-DD format
   * @throws Error if any individual date input is invalid
   */
  static normalizeDateInputs(dateInputs: FlexibleDateInput[]): string[] {
    return dateInputs.map(this.normalizeDateInput);
  }

  /**
   * Validates that a date input is supported (without parsing)
   * @param dateInput - Input to validate
   * @returns true if the input type is supported, false otherwise
   */
  static isSupportedType(dateInput: any): dateInput is FlexibleDateInput {
    return (
      typeof dateInput === 'string' ||
      moment.isMoment(dateInput) ||
      dateInput instanceof Date
    );
  }

  /**
   * Gets a human-readable description of supported date formats
   * @returns String describing supported formats
   */
  static getSupportedFormatsDescription(): string {
    return "Supported formats: YYYY-MM-DD strings, moment objects, Date objects, or parseable date strings (e.g., '2025/03/01', 'March 1, 2025')";
  }
}
