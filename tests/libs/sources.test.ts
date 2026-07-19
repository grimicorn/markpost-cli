import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSource, deleteSource, fetchSources } from '@/libs/sources.js';
import { logErrorMessage } from '@/libs/errors.js';
import { ApiDeleteMeta } from '@/types/api.types.js';
import { Source } from '@/types/sources.types.js';

vi.mock('@/libs/api.js', () => ({
  getBaseUrl: () => 'https://example.com',
  getApiToken: () => 'test-token',
  formatErrorMessages: (errors: { title: string; detail: string }[]) =>
    errors.length > 0
      ? errors.map((e) => `${e.title}: ${e.detail}`).join('\n')
      : 'Unknown error occurred',
}));

vi.mock('@/libs/errors.js', () => ({
  logErrorMessage: vi.fn(),
}));

const mockSource: Source = {
  uuid: 'abc-123',
  createdAt: '2024-01-01T00:00:00Z',
  type: 'webhook',
  name: 'Test Source',
  provider: null,
  endpointSlug: 'wh_abc12345',
  routeFolder: '99-incoming/',
  lastHitAt: null,
  recordCount: 0,
};

const mockMeta: ApiDeleteMeta = { deleted: 1 };

function mockFetch(responseBody: object, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(responseBody),
  });
}

describe('fetchSources', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls fetch with the correct URL and auth header', async () => {
    mockFetch({ data: [{ attributes: mockSource }] });
    await fetchSources();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/sources',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  it('returns the list of source attributes on success', async () => {
    mockFetch({ data: [{ attributes: mockSource }] });
    expect(await fetchSources()).toEqual([mockSource]);
  });

  it('returns [] and surfaces error details when the response is not ok', async () => {
    mockFetch({ data: { errors: [{ title: 'Error', detail: 'Server error' }] } }, false);
    expect(await fetchSources()).toEqual([]);
    expect(logErrorMessage).toHaveBeenCalledWith('fetchSources', 'Error: Server error');
  });

  it('returns [] on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    expect(await fetchSources()).toEqual([]);
  });
});

describe('createSource', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls fetch with POST, correct headers, and JSON:API body', async () => {
    mockFetch({ data: { attributes: mockSource } });
    await createSource({
      type: 'webhook',
      name: 'Test Source',
      routeFolder: '99-incoming/',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/sources',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.api+json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({
          data: {
            type: 'sources',
            attributes: {
              type: 'webhook',
              name: 'Test Source',
              routeFolder: '99-incoming/',
            },
          },
        }),
      }),
    );
  });

  it('returns the source attributes on success', async () => {
    mockFetch({ data: { attributes: mockSource } });
    expect(
      await createSource({
        type: 'webhook',
        name: 'Test Source',
        routeFolder: '99-incoming/',
      }),
    ).toEqual(mockSource);
  });

  it('returns null and surfaces error details when the response contains errors', async () => {
    mockFetch(
      {
        data: {
          errors: [{ title: 'Invalid Attribute', detail: 'Type must be one of: webhook, email' }],
        },
      },
      false,
    );
    const result = await createSource({
      type: 'bogus',
      name: 'Test Source',
      routeFolder: '99-incoming/',
    });
    expect(result).toBeNull();
    expect(logErrorMessage).toHaveBeenCalledWith(
      'createSource["Test Source"]',
      'Invalid Attribute: Type must be one of: webhook, email',
    );
  });

  it('returns null on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    expect(
      await createSource({
        type: 'webhook',
        name: 'Test Source',
        routeFolder: '99-incoming/',
      }),
    ).toBeNull();
  });
});

describe('deleteSource', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls fetch with DELETE and the uuid in the URL', async () => {
    mockFetch({ meta: mockMeta });
    await deleteSource('abc-123');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/sources/abc-123',
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  it('returns meta on success', async () => {
    mockFetch({ meta: mockMeta });
    expect(await deleteSource('abc-123')).toEqual(mockMeta);
  });

  it('returns null and surfaces error details when the response contains errors', async () => {
    mockFetch(
      { data: { errors: [{ title: 'Not Found', detail: 'No source was found for the given uuid.' }] } },
      false,
    );
    const result = await deleteSource('missing-uuid');
    expect(result).toBeNull();
    expect(logErrorMessage).toHaveBeenCalledWith(
      'deleteSource["missing-uuid"]',
      'Not Found: No source was found for the given uuid.',
    );
  });

  it('returns null on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    expect(await deleteSource('abc-123')).toBeNull();
  });
});
