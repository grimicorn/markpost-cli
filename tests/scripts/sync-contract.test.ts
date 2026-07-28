import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertContractIsTypeOnly,
  parseFromPathArg,
  // @ts-expect-error -- plain .mjs, not part of the typed src/ tree.
} from '../../scripts/sync-contract.mjs';

describe('parseFromPathArg', () => {
  it('returns undefined when no --from flag is present', () => {
    expect(parseFromPathArg([])).toBeUndefined();
  });

  it('accepts the space form: --from <path>', () => {
    const existingPath = mkdtempSync(join(tmpdir(), 'sync-contract-test-'));

    try {
      expect(parseFromPathArg(['--from', existingPath])).toBe(existingPath);
    } finally {
      rmSync(existingPath, { recursive: true, force: true });
    }
  });

  it('accepts the equals form: --from=<path>', () => {
    const existingPath = mkdtempSync(join(tmpdir(), 'sync-contract-test-'));

    try {
      expect(parseFromPathArg([`--from=${existingPath}`])).toBe(existingPath);
    } finally {
      rmSync(existingPath, { recursive: true, force: true });
    }
  });

  it('throws when --from= has an empty value', () => {
    expect(() => parseFromPathArg(['--from='])).toThrow(
      '--from requires a path to a local markpost checkout',
    );
  });

  it('throws when --from has no following value', () => {
    expect(() => parseFromPathArg(['--from'])).toThrow(
      '--from requires a path to a local markpost checkout',
    );
  });

  it('throws when --from is immediately followed by another flag', () => {
    expect(() => parseFromPathArg(['--from', '--other'])).toThrow();
  });

  it('throws when the --from path does not exist', () => {
    expect(() =>
      parseFromPathArg(['--from', '/no/such/path/on/this/machine']),
    ).toThrow('--from path does not exist');
  });

  it('throws on an unrecognized flag', () => {
    expect(() => parseFromPathArg(['--dry-run'])).toThrow(
      'Unrecognized option(s): --dry-run',
    );
  });

  // Regression coverage: an unrecognized flag alongside a valid --from must
  // still fail loudly instead of being silently ignored.
  it('throws on an unrecognized flag even when --from is also present', () => {
    const existingPath = mkdtempSync(join(tmpdir(), 'sync-contract-test-'));

    try {
      expect(() =>
        parseFromPathArg(['--from', existingPath, '--dry-run']),
      ).toThrow('Unrecognized option(s): --dry-run');
    } finally {
      rmSync(existingPath, { recursive: true, force: true });
    }
  });
});

describe('assertContractIsTypeOnly', () => {
  it('accepts type aliases, interfaces, and type-only imports', () => {
    expect(() =>
      assertContractIsTypeOnly(`
        import type { Foo } from './foo';
        export type ApiError = { status: string };
        export interface ApiResourceObject { type: string; }
      `),
    ).not.toThrow();
  });

  it('rejects a runtime statement, e.g. a value export', () => {
    expect(() =>
      assertContractIsTypeOnly(`
        export const ApiError = { status: 'x' };
      `),
    ).toThrow(/non-type declaration/);
  });

  it('rejects a runtime (non type-only) import', () => {
    expect(() =>
      assertContractIsTypeOnly(`
        import { readFileSync } from 'node:fs';
        export type ApiError = { status: string };
      `),
    ).toThrow(/non-type declaration/);
  });

  it('rejects a side-effecting function declaration', () => {
    expect(() =>
      assertContractIsTypeOnly(`
        console.log('side effect');
      `),
    ).toThrow(/non-type declaration/);
  });
});
