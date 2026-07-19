import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRecord,
  deleteRecords,
  fetchAllRecords,
  fetchPaginatedRecords,
  fetchRecord,
} from '@/libs/records.js';
import { ApiDeleteMeta } from '@/types/api.types.js';
import { Record } from '@/types/records.types.js';

// Only override the external-service seams (base URL, token). Everything
// else — formatErrorMessages, assertApiSuccess — stays real so these tests
// exercise production error-parsing logic instead of a hand-copied stand-in
// that could silently drift from it.
vi.mock('@/libs/api.js', async () => {
  const actual =
    await vi.importActual<typeof import('@/libs/api.js')>('@/libs/api.js');

  return {
    ...actual,
    getBaseUrl: () => 'https://example.com',
    getApiToken: () => 'test-token',
  };
});

const mockRecord: Record = {
  uuid: 'abc-123',
  title: 'Test Title',
  content: 'Test Content',
  createdAt: '2024-01-01T00:00:00Z',
};

const mockMeta: ApiDeleteMeta = { deleted: 1 };

const mockPaginatedMeta = { total: 1, pageCount: 1, size: 100, page: 1 };

function mockFetch(responseBody: object, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(responseBody),
  });
}

const mockRecord2: Record = {
  uuid: 'def-456',
  title: 'Test Title 2',
  content: 'Test Content 2',
  createdAt: '2024-01-02T00:00:00Z',
};

describe('fetchAllRecords', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns [] when the initial fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    expect(await fetchAllRecords()).toEqual([]);
  });

  it('returns records directly when there is only one page', async () => {
    mockFetch({
      data: [{ attributes: mockRecord }],
      meta: { total: 1, pageCount: 1, size: 100, page: 1 },
    });
    expect(await fetchAllRecords()).toEqual([mockRecord]);
  });

  it('fetches and combines all pages when pageCount > 1', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord }],
            meta: { total: 2, pageCount: 2, size: 1, page: 1 },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord2 }],
            meta: { total: 2, pageCount: 2, size: 1, page: 2 },
          }),
      });
    expect(await fetchAllRecords()).toEqual([mockRecord, mockRecord2]);
  });

  it('returns partial results if a subsequent page fetch fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord }],
            meta: { total: 2, pageCount: 2, size: 1, page: 1 },
          }),
      })
      .mockRejectedValueOnce(new Error('Network error'));
    expect(await fetchAllRecords()).toEqual([mockRecord]);
  });
});

describe('fetchPaginatedRecords', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls fetch with the correct URL and auth header', async () => {
    mockFetch({ data: [mockRecord], meta: mockPaginatedMeta });
    await fetchPaginatedRecords(2, 50);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/records?page[number]=2&page[size]=50',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  it('returns records and meta on success', async () => {
    mockFetch({ data: [{ attributes: mockRecord }], meta: mockPaginatedMeta });
    expect(await fetchPaginatedRecords()).toEqual({
      records: [mockRecord],
      meta: mockPaginatedMeta,
    });
  });

  it('returns null when the response contains errors', async () => {
    mockFetch(
      { data: { errors: [{ title: 'Error', detail: 'Server error' }] } },
      false,
    );
    expect(await fetchPaginatedRecords()).toBeNull();
  });

  it('surfaces the API error detail instead of "Unknown error occurred"', async () => {
    mockFetch(
      {
        data: {
          errors: [{ title: 'Unauthorized', detail: 'Invalid API token' }],
        },
      },
      false,
    );

    expect(await fetchPaginatedRecords()).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unauthorized: Invalid API token'),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Unknown error occurred'),
    );
  });

  it('returns null on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    expect(await fetchPaginatedRecords()).toBeNull();
  });
});

describe('createRecord', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls fetch with POST, correct headers, and JSON:API body', async () => {
    mockFetch({ data: { attributes: mockRecord } });
    await createRecord('Test Title', 'Test Content');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/records',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.api+json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({
          data: {
            type: 'records',
            attributes: { title: 'Test Title', content: 'Test Content' },
          },
        }),
      }),
    );
  });

  it('returns the record attributes on success', async () => {
    mockFetch({ data: { attributes: mockRecord } });
    expect(await createRecord('Test Title', 'Test Content')).toEqual(
      mockRecord,
    );
  });

  it('returns null when the response contains errors', async () => {
    mockFetch(
      { data: { errors: [{ title: 'Error', detail: 'Bad request' }] } },
      false,
    );
    expect(await createRecord('Test Title', 'Test Content')).toBeNull();
  });

  it('returns null on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    expect(await createRecord('Test Title', 'Test Content')).toBeNull();
  });
});

describe('fetchRecord', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls fetch with the correct UUID in the URL', async () => {
    mockFetch({ data: { attributes: mockRecord } });
    await fetchRecord('abc-123');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/records/abc-123',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  it('returns the record attributes on success', async () => {
    mockFetch({ data: { attributes: mockRecord } });
    expect(await fetchRecord('abc-123')).toEqual(mockRecord);
  });

  it('returns null when the response contains errors', async () => {
    mockFetch(
      { data: { errors: [{ title: 'Not Found', detail: 'Record missing' }] } },
      false,
    );
    expect(await fetchRecord('abc-123')).toBeNull();
  });

  it('returns null on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    expect(await fetchRecord('abc-123')).toBeNull();
  });
});

describe('deleteRecords', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls fetch with DELETE, correct headers, and JSON:API body', async () => {
    mockFetch({ meta: mockMeta });
    await deleteRecords(['abc-123', 'def-456']);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/records',
      expect.objectContaining({
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/vnd.api+json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({
          data: {
            type: 'records',
            attributes: { uuids: ['abc-123', 'def-456'] },
          },
        }),
      }),
    );
  });

  it('returns meta on success', async () => {
    mockFetch({ meta: mockMeta });
    expect(await deleteRecords(['abc-123'])).toEqual(mockMeta);
  });

  it('returns null when the response contains errors', async () => {
    mockFetch(
      { data: { errors: [{ title: 'Error', detail: 'Bad request' }] } },
      false,
    );
    expect(await deleteRecords(['abc-123'])).toBeNull();
  });

  it('returns null on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    expect(await deleteRecords(['abc-123'])).toBeNull();
  });
});
