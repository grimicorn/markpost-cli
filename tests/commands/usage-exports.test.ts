import { describe, expect, it } from 'vitest';

import { USAGE as PUSH_USAGE } from '@/commands/push.js';
import { USAGE as GET_USAGE } from '@/commands/get.js';
import { USAGE as SOURCES_USAGE } from '@/commands/sources.js';
import { USAGE as RECORDS_USAGE } from '@/commands/records.js';

// The top-level help in index.ts aggregates these real exports. index.test.ts
// mocks the command modules, so a renamed or dropped USAGE export would slip
// past it (help would render the literal `undefined`). This asserts against the
// real modules so that drift fails a test.
describe('command USAGE exports', () => {
  it.each([
    ['push', PUSH_USAGE],
    ['get', GET_USAGE],
    ['sources', SOURCES_USAGE],
    ['records', RECORDS_USAGE],
  ])('%s exports a non-empty USAGE string starting with "Usage:"', (name, usage) => {
    expect(typeof usage).toBe('string');
    expect(usage.length).toBeGreaterThan(0);
    expect(usage.startsWith(`Usage: markpost ${name}`)).toBe(true);
  });
});
