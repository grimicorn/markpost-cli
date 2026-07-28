import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertApiSuccess,
  formatErrorMessages,
  getApiToken,
  getBaseUrl,
  unwrapResourceAttributes,
  unwrapResourceCollection,
} from '@/libs/api.js';
import { logErrorMessage } from '@/libs/errors.js';
import { ApiError, ApiResourceObject, ApiResponse } from '@/types/api.types.js';

vi.mock('@/libs/config.js', () => ({
  config: { get: vi.fn() },
}));

vi.mock('@/libs/errors.js', () => ({
  logErrorMessage: vi.fn(),
}));

describe('getBaseUrl', () => {
  const original = process.env.BASE_URL;

  afterEach(() => {
    process.env.BASE_URL = original;
  });

  it('returns BASE_URL env var when set', () => {
    process.env.BASE_URL = 'https://example.com';
    expect(getBaseUrl()).toBe('https://example.com');
  });

  it('returns default URL when BASE_URL is not set', () => {
    delete process.env.BASE_URL;
    expect(getBaseUrl()).toBe('https://sync.danholloran.me');
  });
});

describe('getApiToken', () => {
  const original = process.env.API_TOKEN;

  afterEach(() => {
    process.env.API_TOKEN = original;
  });

  it('returns API_TOKEN env var when set', () => {
    process.env.API_TOKEN = 'test-token';
    expect(getApiToken()).toBe('test-token');
  });

  it('returns undefined when API_TOKEN is not set', () => {
    delete process.env.API_TOKEN;
    expect(getApiToken()).toBeUndefined();
  });
});

describe('formatErrorMessages', () => {
  const error = (title: string, detail: string): ApiError => ({
    status: '400',
    title,
    detail,
    source: {},
  });

  it('returns "Unknown error occurred" for empty array', () => {
    expect(formatErrorMessages([])).toBe('Unknown error occurred');
  });

  it('returns "Title: Detail" for a single error', () => {
    expect(formatErrorMessages([error('Bad Request', 'Invalid input')])).toBe(
      'Bad Request: Invalid input',
    );
  });

  it('returns a bulleted list for multiple errors', () => {
    const errors = [
      error('Bad Request', 'Invalid input'),
      error('Unprocessable', 'Missing field'),
    ];
    expect(formatErrorMessages(errors)).toBe(
      '- Bad Request: Invalid input\n- Unprocessable: Missing field',
    );
  });
});

describe('assertApiSuccess', () => {
  const error = (title: string, detail: string): ApiError => ({
    status: '400',
    title,
    detail,
    source: {},
  });

  it('does not throw when the response is ok and carries no errors', () => {
    expect(() =>
      assertApiSuccess({ ok: true } as Response, { data: {} }),
    ).not.toThrow();
  });

  it('does not throw when the response is ok and errors is a present but empty array', () => {
    expect(() =>
      assertApiSuccess({ ok: true } as Response, { data: { errors: [] } }),
    ).not.toThrow();
  });

  it('throws with the real error detail when the body carries errors', () => {
    const body = {
      data: { errors: [error('Unauthorized', 'Invalid or missing token')] },
    };

    expect(() => assertApiSuccess({ ok: false } as Response, body)).toThrow(
      'Unauthorized: Invalid or missing token',
    );
  });

  it('throws "Unknown error occurred" when the response fails with no error body', () => {
    expect(() =>
      assertApiSuccess({ ok: false } as Response, undefined),
    ).toThrow('Unknown error occurred');
  });

  it('throws when the response is ok but the body still carries errors', () => {
    const body = { data: { errors: [error('Conflict', 'Duplicate record')] } };

    expect(() => assertApiSuccess({ ok: true } as Response, body)).toThrow(
      'Conflict: Duplicate record',
    );
  });

  // markpost's declared `ApiResponse<T>` contract models a top-level
  // `errors` field (`{ errors: ApiError[], data?: never }`) as an
  // alternative to today's actual `data.errors` shape. Nothing currently
  // sends this shape, but the CLI must not silently accept it as success
  // just because it doesn't match the shape every handler happens to use
  // today.
  it('throws when the body carries top-level errors instead of nested data.errors', () => {
    const body = { errors: [error('Unauthorized', 'Invalid or missing token')] };

    expect(() => assertApiSuccess({ ok: false } as Response, body)).toThrow(
      'Unauthorized: Invalid or missing token',
    );
  });

  it('throws when the response is ok but carries top-level errors', () => {
    const body = { errors: [error('Conflict', 'Duplicate record')] };

    expect(() => assertApiSuccess({ ok: true } as Response, body)).toThrow(
      'Conflict: Duplicate record',
    );
  });

  it('does not let an empty data.errors mask a populated top-level errors', () => {
    const body = {
      data: { errors: [] },
      errors: [error('Conflict', 'Duplicate record')],
    };

    expect(() => assertApiSuccess({ ok: true } as Response, body)).toThrow(
      'Conflict: Duplicate record',
    );
  });
});

describe('unwrapResourceAttributes', () => {
  type FixtureAttributes = { uuid: string; title: string };
  type FixtureResource = ApiResourceObject & {
    type: 'fixtures';
    attributes: FixtureAttributes;
  };

  it('returns the attributes off a resource object', () => {
    const body: ApiResponse<FixtureResource | null> = {
      data: {
        type: 'fixtures',
        id: 'abc-123',
        attributes: { uuid: 'abc-123', title: 'Hello' },
      },
    };

    expect(unwrapResourceAttributes(body)).toEqual({
      uuid: 'abc-123',
      title: 'Hello',
    });
  });

  it('returns null when data is null', () => {
    const body: ApiResponse<FixtureResource | null> = { data: null };

    expect(unwrapResourceAttributes(body)).toBeNull();
  });

  it('returns null (not undefined) when the resource has no attributes', () => {
    const body = {
      data: { type: 'fixtures', id: 'abc-123' },
    } as ApiResponse<FixtureResource | null>;

    expect(unwrapResourceAttributes(body)).toBeNull();
  });
});

describe('unwrapResourceCollection', () => {
  type FixtureAttributes = { uuid: string; title: string };
  type FixtureResource = ApiResourceObject & {
    type: 'fixtures';
    attributes: FixtureAttributes;
  };

  const fixture: FixtureAttributes = { uuid: 'abc-123', title: 'Hello' };

  beforeEach(() => {
    vi.mocked(logErrorMessage).mockClear();
  });

  it('returns [] and does not log when data is missing entirely', () => {
    const body = {} as ApiResponse<FixtureResource[]>;

    expect(unwrapResourceCollection('context', body, 'fixture')).toEqual([]);
    expect(logErrorMessage).not.toHaveBeenCalled();
  });

  it('returns the attributes of every usable resource', () => {
    const body: ApiResponse<FixtureResource[]> = {
      data: [
        { type: 'fixtures', id: 'abc-123', attributes: fixture },
        { type: 'fixtures', id: 'def-456', attributes: { ...fixture, uuid: 'def-456' } },
      ],
    };

    expect(unwrapResourceCollection('context', body, 'fixture')).toEqual([
      fixture,
      { ...fixture, uuid: 'def-456' },
    ]);
    expect(logErrorMessage).not.toHaveBeenCalled();
  });

  it('drops a resource with attributes explicitly null and logs the skip', () => {
    const body = {
      data: [
        { type: 'fixtures', id: 'abc-123', attributes: fixture },
        { type: 'fixtures', id: 'def-456', attributes: null },
      ],
    } as unknown as ApiResponse<FixtureResource[]>;

    expect(unwrapResourceCollection('myContext', body, 'fixture')).toEqual([
      fixture,
    ]);
    expect(logErrorMessage).toHaveBeenCalledWith(
      'myContext',
      'Skipped 1 fixture(s) with no attributes',
    );
  });

  // The everything-dropped path matters most: it still returns successfully
  // (an empty array, not a thrown error), so the only signal something's
  // wrong is the logged skip count — this must not silently look identical
  // to "the server legitimately returned zero resources".
  it('drops every resource and logs the full count when none are usable', () => {
    const body = {
      data: [
        { type: 'fixtures', id: 'abc-123' },
        { type: 'fixtures', id: 'def-456', attributes: null },
      ],
    } as unknown as ApiResponse<FixtureResource[]>;

    expect(unwrapResourceCollection('myContext', body, 'fixture')).toEqual([]);
    expect(logErrorMessage).toHaveBeenCalledWith(
      'myContext',
      'Skipped 2 fixture(s) with no attributes',
    );
  });
});
