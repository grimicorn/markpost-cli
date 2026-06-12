import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatErrorMessages, getApiToken, getBaseUrl } from '@/libs/api.js';
import { ApiError } from '@/types/api.types.js';

vi.mock('@/libs/config.js', () => ({
  config: { get: vi.fn() },
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
