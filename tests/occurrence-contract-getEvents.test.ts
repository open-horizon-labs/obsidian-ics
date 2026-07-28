import ICSPlugin from '../src/main';
import {
  registerOccurrenceContractSuite,
  type OccurrenceContractPluginCtor,
} from './helpers/occurrenceContractSuite';

// Drives the occurrence identity/determinism contract against the TypeScript
// source. The same suite runs against the compiled dist/main.js in
// tests/issue-198-dist-artifact.test.ts (npm run test:dist-artifact), so a
// contract that only holds before bundling can't pass unnoticed.

registerOccurrenceContractSuite(
  'source: src/main.ts',
  ICSPlugin as unknown as OccurrenceContractPluginCtor,
);
