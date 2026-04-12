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

vi.mock('@/libs/api.js', () => ({
  getBaseUrl: () => 'https://example.com',
  getApiToken: () => 'test-token',
  logErrorMessage: vi.fn(),
  formatErrorMessages: (errors: { title: string; detail: string }[]) =>
    errors.map((e) => `${e.title}: ${e.detail}`).join('\n'),
}));

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
  it('returns [] when the initial fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    expect(await fetchAllRecords()).toEqual([]);
  });

  it('returns records directly when there is only one page', async () => {
    mockFetch({
      data: [mockRecord],
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
            data: [mockRecord],
            meta: { total: 2, pageCount: 2, size: 1, page: 1 },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [mockRecord2],
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
            data: [mockRecord],
            meta: { total: 2, pageCount: 2, size: 1, page: 1 },
          }),
      })
      .mockRejectedValueOnce(new Error('Network error'));
    expect(await fetchAllRecords()).toEqual([mockRecord]);
  });
});

describe('fetchPaginatedRecords', () => {
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
    mockFetch({ data: [mockRecord], meta: mockPaginatedMeta });
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

  it('returns null on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    expect(await fetchPaginatedRecords()).toBeNull();
  });
});

describe('createRecord', () => {
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
