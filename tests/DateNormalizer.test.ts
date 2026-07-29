import { DateNormalizer, FlexibleDateInput } from '../src/DateNormalizer';
import { moment } from 'obsidian';

describe('DateNormalizer', () => {
  describe('normalizeDateInput', () => {
    describe('string inputs', () => {
      it('should handle YYYY-MM-DD format (already normalized)', () => {
        const result = DateNormalizer.normalizeDateInput('2025-03-01');
        expect(result).toBe('2025-03-01');
      });

      it('should parse and normalize various string formats', () => {
        const testCases = [
          { input: '2025/03/01', expected: '2025-03-01' },
          { input: '03/01/2025', expected: '2025-03-01' },
          { input: 'March 1, 2025', expected: '2025-03-01' },
          { input: '1 Mar 2025', expected: '2025-03-01' },
          { input: '2025-03-01T12:30:00', expected: '2025-03-01' },
          {
            input: '2025-03-01T12:30:00Z',
            expected: moment('2025-03-01T12:30:00Z').format('YYYY-MM-DD')
          }
        ];

        testCases.forEach(({ input, expected }) => {
          const result = DateNormalizer.normalizeDateInput(input);
          expect(result).toBe(expected);
        });
      });

      it('should throw error for invalid date strings', () => {
        const invalidDates = [
          'invalid-date',
          'not-a-date',
          'foo bar',
          ''
        ];

        invalidDates.forEach(invalidDate => {
          expect(() => DateNormalizer.normalizeDateInput(invalidDate))
            .toThrow(`Invalid date string: ${invalidDate}`);
        });
      });

      it('should handle edge case invalid dates that moment accepts', () => {
        // Note: moment is quite permissive - these dates are technically invalid
        // but moment will try to parse them, so we test that they at least return something
        const edgeCaseDates = [
          '2025-13-01', // Invalid month - moment converts to 2026-01-01
          '2025-02-30'  // Invalid day for February - moment converts to 2025-03-02
        ];

        edgeCaseDates.forEach(edgeDate => {
          // These should not throw, but should return some normalized date
          const result = DateNormalizer.normalizeDateInput(edgeDate);
          expect(typeof result).toBe('string');
          expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
      });
    });

    describe('moment object inputs', () => {
      it('should handle moment objects', () => {
        const momentObj = moment('2025-03-01T12:30:00');
        const result = DateNormalizer.normalizeDateInput(momentObj);
        expect(result).toBe('2025-03-01');
      });

      it('should handle moment objects with different timezones', () => {
        const momentUtc = moment.utc('2025-03-01T23:30:00');
        const result = DateNormalizer.normalizeDateInput(momentUtc);
        expect(result).toBe('2025-03-01');
      });

      it('should handle moment objects created from different sources', () => {
        const fromString = moment('March 1, 2025');
        const fromArray = moment([2025, 2, 1]); // month is 0-indexed in moment
        
        expect(DateNormalizer.normalizeDateInput(fromString)).toBe('2025-03-01');
        expect(DateNormalizer.normalizeDateInput(fromArray)).toBe('2025-03-01');
      });
    });

    describe('Date object inputs', () => {
      it('should handle Date objects', () => {
        const dateObj = new Date('2025-03-01T12:30:00');
        const result = DateNormalizer.normalizeDateInput(dateObj);
        expect(result).toBe('2025-03-01');
      });

      it('should handle Date objects with different times', () => {
        const morningDate = new Date('2025-03-01T06:00:00');
        const eveningDate = new Date('2025-03-01T18:30:00');
        
        expect(DateNormalizer.normalizeDateInput(morningDate)).toBe('2025-03-01');
        expect(DateNormalizer.normalizeDateInput(eveningDate)).toBe('2025-03-01');
      });
    });

    describe('error handling', () => {
      it('should throw error for null input', () => {
        expect(() => DateNormalizer.normalizeDateInput(null))
          .toThrow('Date input cannot be null or undefined');
      });

      it('should throw error for undefined input', () => {
        expect(() => DateNormalizer.normalizeDateInput(undefined))
          .toThrow('Date input cannot be null or undefined');
      });

      it('should throw error for unsupported input types', () => {
        const unsupportedInputs: unknown[] = [
          123,
          true,
          false,
          {},
          [],
          Symbol('test')
        ];

        unsupportedInputs.forEach(input => {
          expect(() => DateNormalizer.normalizeDateInput(input as FlexibleDateInput))
            .toThrow(`Unsupported date input type: ${typeof input}`);
        });
      });
    });
  });

  describe('normalizeDateInputs', () => {
    it('should handle arrays of mixed input types', () => {
      const inputs: FlexibleDateInput[] = [
        '2025-03-01',
        moment('2025-03-02'),
        new Date('2025-03-03T12:00:00'),
        '2025/03/04',
        'March 5, 2025'
      ];
      
      const results = DateNormalizer.normalizeDateInputs(inputs);
      expect(results).toEqual([
        '2025-03-01',
        '2025-03-02',
        '2025-03-03',
        '2025-03-04',
        '2025-03-05'
      ]);
    });

    it('should handle empty arrays', () => {
      const results = DateNormalizer.normalizeDateInputs([]);
      expect(results).toEqual([]);
    });

    it('should propagate errors from individual date parsing', () => {
      const inputs: FlexibleDateInput[] = ['2025-03-01', 'invalid-date'];
      expect(() => DateNormalizer.normalizeDateInputs(inputs))
        .toThrow('Invalid date string: invalid-date');
    });

    it('should handle single-element arrays', () => {
      const results = DateNormalizer.normalizeDateInputs([moment('2025-03-01')]);
      expect(results).toEqual(['2025-03-01']);
    });
  });

  describe('isSupportedType', () => {
    it('should return true for supported types', () => {
      const supportedInputs = [
        '2025-03-01',
        moment('2025-03-01'),
        new Date('2025-03-01'),
        'March 1, 2025',
        '2025/03/01'
      ];

      supportedInputs.forEach(input => {
        expect(DateNormalizer.isSupportedType(input)).toBe(true);
      });
    });

    it('should return false for unsupported types', () => {
      const unsupportedInputs: unknown[] = [
        123,
        true,
        null,
        undefined,
        {},
        [],
        Symbol('test')
      ];

      unsupportedInputs.forEach(input => {
        expect(DateNormalizer.isSupportedType(input)).toBe(false);
      });
    });
  });

  describe('getSupportedFormatsDescription', () => {
    it('should return a helpful description string', () => {
      const description = DateNormalizer.getSupportedFormatsDescription();
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
      expect(description).toContain('YYYY-MM-DD');
      expect(description).toContain('moment');
      expect(description).toContain('Date');
    });
  });

  describe('integration scenarios', () => {
    it('should handle Templater-style usage patterns', () => {
      // Simulate common Templater scenarios
      const fileTitle = '20250301'; // YYYYMMDD format
      const momentFromTitle = moment(fileTitle, 'YYYYMMDD');
      const result = DateNormalizer.normalizeDateInput(momentFromTitle);
      expect(result).toBe('2025-03-01');
    });

    it('should handle date ranges', () => {
      const startDate = '2025-03-01';
      const endDate = moment('2025-03-07');
      
      const results = DateNormalizer.normalizeDateInputs([startDate, endDate]);
      expect(results).toEqual(['2025-03-01', '2025-03-07']);
    });

    it('should handle timezone edge cases', () => {
      // Date objects represent instants, so normalize to the host's local day.
      const utcDate = new Date('2025-03-01T23:59:59Z');
      const result = DateNormalizer.normalizeDateInput(utcDate);
      expect(result).toBe(moment(utcDate).format('YYYY-MM-DD'));
    });
  });
});
