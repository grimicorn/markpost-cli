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

const mockPaginatedMeta = { total: 1, size: 100, hasMore: false };

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
      meta: { total: 1, size: 100, hasMore: false },
      links: { next: null, prev: null },
    });
    expect(await fetchAllRecords()).toEqual([mockRecord]);
    // A single page must not trigger a second fetch.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('follows links.next until hasMore is false, combining all pages', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord }],
            meta: { total: 2, size: 1, hasMore: true },
            links: {
              next: '/api/records?page[after]=abc-123&page[size]=1',
              prev: null,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord2 }],
            meta: { total: 2, size: 1, hasMore: false },
            links: { next: null, prev: null },
          }),
      });

    expect(await fetchAllRecords()).toEqual([mockRecord, mockRecord2]);
    // This is the regression check for the bug in #15: the second page must
    // actually be requested using the cursor from `links.next`, not skipped.
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com/api/records?page[size]=100&page[after]=abc-123',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  it('keeps following the cursor across more than two pages', async () => {
    const mockRecord3: Record = {
      uuid: 'ghi-789',
      title: 'Test Title 3',
      content: 'Test Content 3',
      createdAt: '2024-01-03T00:00:00Z',
    };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord }],
            meta: { total: 3, size: 1, hasMore: true },
            links: {
              next: '/api/records?page[after]=abc-123&page[size]=1',
              prev: null,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord2 }],
            meta: { total: 3, size: 1, hasMore: true },
            links: {
              next: '/api/records?page[after]=def-456&page[size]=1',
              prev: null,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord3 }],
            meta: { total: 3, size: 1, hasMore: false },
            links: { next: null, prev: null },
          }),
      });

    expect(await fetchAllRecords()).toEqual([
      mockRecord,
      mockRecord2,
      mockRecord3,
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('returns partial results if a subsequent page fetch fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord }],
            meta: { total: 2, size: 1, hasMore: true },
            links: {
              next: '/api/records?page[after]=abc-123&page[size]=1',
              prev: null,
            },
          }),
      })
      .mockRejectedValueOnce(new Error('Network error'));
    expect(await fetchAllRecords()).toEqual([mockRecord]);
  });

  it('stops instead of looping forever if the server repeats the same cursor', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ attributes: mockRecord }],
          meta: { total: 2, size: 1, hasMore: true },
          links: {
            next: '/api/records?page[after]=abc-123&page[size]=1',
            prev: null,
          },
        }),
    });

    expect(await fetchAllRecords()).toEqual([mockRecord, mockRecord]);
    // The second response repeats the same `page[after]=abc-123` cursor as
    // the first, so the loop must break rather than fetch forever.
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('stops instead of looping forever on a longer cursor cycle (A -> B -> A)', async () => {
    const mockRecord3: Record = {
      uuid: 'ghi-789',
      title: 'Test Title 3',
      content: 'Test Content 3',
      createdAt: '2024-01-03T00:00:00Z',
    };

    global.fetch = vi
      .fn()
      // Initial page (no incoming cursor) points to cursor-a.
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord }],
            meta: { total: 3, size: 1, hasMore: true },
            links: {
              next: '/api/records?page[after]=cursor-a&page[size]=1',
              prev: null,
            },
          }),
      })
      // Fetched with cursor-a, points to cursor-b.
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord2 }],
            meta: { total: 3, size: 1, hasMore: true },
            links: {
              next: '/api/records?page[after]=cursor-b&page[size]=1',
              prev: null,
            },
          }),
      })
      // Fetched with cursor-b, cycles back to the already-seen cursor-a.
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord3 }],
            meta: { total: 3, size: 1, hasMore: true },
            links: {
              next: '/api/records?page[after]=cursor-a&page[size]=1',
              prev: null,
            },
          }),
      });

    expect(await fetchAllRecords()).toEqual([
      mockRecord,
      mockRecord2,
      mockRecord3,
    ]);
    // Without cycle detection this would alternate between cursor-a and
    // cursor-b forever; cursor-a must not be re-fetched once seen.
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('follows a cursor containing a literal "+" without corrupting it', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord }],
            meta: { total: 2, size: 1, hasMore: true },
            links: {
              next: '/api/records?page[after]=abc%2Bxyz&page[size]=1',
              prev: null,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord2 }],
            meta: { total: 2, size: 1, hasMore: false },
            links: { next: null, prev: null },
          }),
      });

    expect(await fetchAllRecords()).toEqual([mockRecord, mockRecord2]);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com/api/records?page[size]=100&page[after]=abc%2Bxyz',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  it('extracts the cursor when links.next percent-encodes the key, matching markpost\'s own link builder', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord }],
            meta: { total: 2, size: 1, hasMore: true },
            // markpost builds links with `new URLSearchParams(...).toString()`,
            // which percent-encodes `[` and `]` to `%5B`/`%5D`.
            links: {
              next: '/api/records?page%5Bafter%5D=abc-123&page%5Bsize%5D=1',
              prev: null,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord2 }],
            meta: { total: 2, size: 1, hasMore: false },
            links: { next: null, prev: null },
          }),
      });

    expect(await fetchAllRecords()).toEqual([mockRecord, mockRecord2]);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com/api/records?page[size]=100&page[after]=abc-123',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  it('stops pagination instead of throwing when links.next has a malformed cursor', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ attributes: mockRecord }],
          meta: { total: 2, size: 1, hasMore: true },
          // A lone `%` is invalid percent-encoding and throws from
          // `decodeURIComponent`; this must not crash `fetchAllRecords` and
          // discard the page already fetched.
          links: {
            next: '/api/records?page[after]=50%off&page[size]=1',
            prev: null,
          },
        }),
    });

    await expect(fetchAllRecords()).resolves.toEqual([mockRecord]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not truncate a cursor value containing an unencoded "="', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord }],
            meta: { total: 2, size: 1, hasMore: true },
            links: {
              next: '/api/records?page[after]=YWJj==&page[size]=1',
              prev: null,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ attributes: mockRecord2 }],
            meta: { total: 2, size: 1, hasMore: false },
            links: { next: null, prev: null },
          }),
      });

    expect(await fetchAllRecords()).toEqual([mockRecord, mockRecord2]);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com/api/records?page[size]=100&page[after]=YWJj%3D%3D',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });
});

describe('fetchPaginatedRecords', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls fetch with page[size] only when no cursor is given', async () => {
    mockFetch({ data: [mockRecord], meta: mockPaginatedMeta });
    await fetchPaginatedRecords();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/records?page[size]=100',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  it('calls fetch with the cursor and page[size] and auth header', async () => {
    mockFetch({ data: [mockRecord], meta: mockPaginatedMeta });
    await fetchPaginatedRecords('abc-123', 50);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/records?page[size]=50&page[after]=abc-123',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });

  it('returns records, meta, and links on success', async () => {
    mockFetch({
      data: [{ attributes: mockRecord }],
      meta: mockPaginatedMeta,
      links: { next: null, prev: null },
    });
    expect(await fetchPaginatedRecords()).toEqual({
      records: [mockRecord],
      meta: mockPaginatedMeta,
      links: { next: null, prev: null },
    });
  });

  it('defaults links to { next: null, prev: null } when omitted', async () => {
    mockFetch({ data: [{ attributes: mockRecord }], meta: mockPaginatedMeta });
    expect(await fetchPaginatedRecords()).toEqual({
      records: [mockRecord],
      meta: mockPaginatedMeta,
      links: { next: null, prev: null },
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
