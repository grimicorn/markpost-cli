import {
  assertApiSuccess,
  getApiToken,
  getBaseUrl,
  isSystemicApiFailure,
  unwrapResourceAttributes,
  unwrapResourceCollection,
} from '@/libs/api.js';
import { logErrorMessage } from '@/libs/errors.js';
import {
  ApiDeleteMeta,
  ApiDeleteResponse,
  ApiPaginationLinks,
} from '@/types/api.types.js';
import {
  Record,
  PaginatedRecordsMeta,
  RecordApiResponse,
  RecordListApiResponse,
} from '@/types/records.types.js';

// markpost paginates with a cursor: each response's `links.next` embeds the
// `page[after]` cursor to request the following page, and is `null` once
// `meta.hasMore` is false. Extracting it from the link (rather than
// re-deriving it from the last record) keeps the CLI decoupled from the
// server's cursor implementation.
//
// This intentionally avoids `URLSearchParams`, which decodes
// `application/x-www-form-urlencoded` and would turn a literal `+` in the
// cursor value into a space; a plain percent-decode of the raw param
// preserves the cursor exactly as the server sent it. The key itself is
// matched after percent-decoding too, since markpost's own link builder
// (`server/utils/response.ts`) produces it as `page%5Bafter%5D=...` via
// `URLSearchParams`, not the literal `page[after]=...`.
// A malformed percent-encoding (e.g. a lone `%`) throws from
// `decodeURIComponent`. Treat that as "no cursor" rather than letting it
// crash `fetchAllRecords` and discard every page already collected.
const decodePercentEncoding = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const extractAfterCursor = (
  next: string | null | undefined,
): string | undefined => {
  if (!next) {
    return undefined;
  }

  const queryString = next.slice(next.indexOf('?') + 1);

  for (const pair of queryString.split('&')) {
    // Split on the first `=` only, so a value that itself contains an
    // unencoded `=` (e.g. base64 padding) isn't truncated.
    const separatorIndex = pair.indexOf('=');
    const rawKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);

    if (decodePercentEncoding(rawKey) !== 'page[after]') {
      continue;
    }

    const rawValue =
      separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1);

    return decodePercentEncoding(rawValue);
  }

  return undefined;
};

// A read either succeeded (`ok: true`) or the INITIAL page fetch failed
// (`ok: false`). Collapsing a failed initial fetch to an empty array — the old
// behavior — made a network/auth error indistinguishable from "no pending
// records", so `sync` reported success and exited 0 while syncing nothing: a
// fail-loud violation that silently masked sync failures in cron. This mirrors
// `fetchSettings`'s `SettingsReadResult` so the caller must handle the failure
// explicitly rather than reading a bare array that hides it.
//
// On success, `records` may be empty (a legitimately empty account) and
// `partial` reports whether a LATER page failed mid-pagination. We keep the
// pages already collected (discarding them would be worse), but flag the read
// incomplete rather than silently returning a truncated result the caller
// can't tell apart from a complete one — the same fail-loud concern one page
// in. The caller surfaces `partial` (warn + non-zero exit); the unfetched
// pages stay on the server for a later run.
export type FetchAllRecordsResult =
  { ok: true; records: Record[]; partial: boolean } | { ok: false };

export const fetchAllRecords = async (): Promise<FetchAllRecordsResult> => {
  const initial = await fetchPaginatedRecords();

  if (!initial) {
    return { ok: false };
  }

  const records = [initial.records];
  const seenCursors = new Set<string>();
  let partial = false;

  // Resolve the next cursor from a page's links. A non-null `links.next` that
  // yields no cursor — malformed percent-encoding, or an off-contract link
  // carrying no `page[after]` — means the server had more pages we can't
  // follow, so flag the read incomplete rather than treating it as a clean end
  // of pagination.
  const nextCursorFrom = (links: ApiPaginationLinks): string | undefined => {
    const cursor = extractAfterCursor(links.next);

    if (links.next && !cursor) {
      partial = true;
    }

    return cursor;
  };

  let after = nextCursorFrom(initial.links);

  while (after) {
    // `seenCursors` bounds the loop against any repeating cursor (not just an
    // immediate repeat), so a misbehaving server can't hang the CLI. A repeat
    // means the server looped us over already-fetched pages while still
    // advertising more, so stop but flag the truncation.
    if (seenCursors.has(after)) {
      partial = true;
      break;
    }

    seenCursors.add(after);
    const subsequent = await fetchPaginatedRecords(after);

    if (!subsequent) {
      // A later page failed (`fetchPaginatedRecords` already logged why). Stop,
      // but mark the read incomplete so the caller doesn't present a truncated
      // set as the whole.
      partial = true;
      break;
    }

    records.push(subsequent.records);
    after = nextCursorFrom(subsequent.links);
  }

  return { ok: true, records: records.flat(1) as Record[], partial };
};

const buildRecordsQuery = (size: number, after?: string): string => {
  if (!after) {
    return `page[size]=${size}`;
  }

  return `page[size]=${size}&page[after]=${encodeURIComponent(after)}`;
};

export const fetchPaginatedRecords = async (
  after?: string,
  size: number = 100,
): Promise<{
  records: Record[];
  meta: PaginatedRecordsMeta;
  links: ApiPaginationLinks;
} | null> => {
  try {
    const response = await fetch(
      `${getBaseUrl()}/api/records?${buildRecordsQuery(size, after)}`,
      {
        headers: {
          Authorization: `Bearer ${getApiToken()}`,
        },
      },
    );

    const body = (await response.json()) as RecordListApiResponse;

    assertApiSuccess(response, body);

    const records = unwrapResourceCollection(
      'fetchPaginatedRecords',
      body,
      'record',
    );

    // `meta`/`links` fall back to conservative defaults, field by field
    // (rather than an unchecked cast of a possibly-partial object), if a
    // response is ever malformed: `hasMore: false` and `next: null` both
    // stop pagination instead of the caller crashing on `undefined.hasMore`
    // or looping forever chasing a cursor that was never there.
    //
    // `total` falls back to the pre-filter resource count (not
    // `records.length`, which has already dropped any unusable resources) —
    // when `meta` is also missing, the fallback should still describe how
    // many resources the server actually sent, not how many survived the
    // attributes check.
    const resourceCount = (body.data ?? []).length;
    const rawMeta = body.meta as Partial<PaginatedRecordsMeta> | undefined;
    const meta: PaginatedRecordsMeta = {
      total: rawMeta?.total ?? resourceCount,
      size: rawMeta?.size ?? size,
      hasMore: rawMeta?.hasMore ?? false,
    };
    const rawLinks = body.links as Partial<ApiPaginationLinks> | undefined;
    const links: ApiPaginationLinks = {
      next: rawLinks?.next ?? null,
      prev: rawLinks?.prev ?? null,
    };

    return { records, meta, links };
  } catch (error) {
    logErrorMessage(
      `fetchPaginatedRecords`,
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
};

export const createRecord = async (
  title: string,
  content: string,
): Promise<Record | null> => {
  try {
    const response = await fetch(`${getBaseUrl()}/api/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${getApiToken()}`,
      },
      body: JSON.stringify({
        data: {
          type: 'records',
          attributes: {
            title,
            content,
          },
        },
      }),
    });

    const body = (await response.json()) as RecordApiResponse;
    assertApiSuccess(response, body);

    return unwrapResourceAttributes(body);
  } catch (error) {
    // Auth (401/403) and 5xx failures doom every other record in a bulk push,
    // so surface them to the caller to fail-fast rather than logging and
    // returning null (which the caller can't distinguish from a per-file 4xx).
    if (isSystemicApiFailure(error)) {
      throw error;
    }

    logErrorMessage(
      `createRecord["${title}"]`,
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
};

export const fetchRecord = async (uuid: string): Promise<Record | null> => {
  try {
    const response = await fetch(`${getBaseUrl()}/api/records/${uuid}`, {
      headers: {
        Authorization: `Bearer ${getApiToken()}`,
      },
    });

    const body = (await response.json()) as RecordApiResponse;

    assertApiSuccess(response, body);

    return unwrapResourceAttributes(body);
  } catch (error) {
    logErrorMessage(
      `fetchRecord["${uuid}"]`,
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
};

export const deleteRecords = async (
  uuids: string[],
): Promise<ApiDeleteMeta | null> => {
  try {
    const response = await fetch(`${getBaseUrl()}/api/records`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${getApiToken()}`,
      },
      body: JSON.stringify({
        data: {
          type: 'records',
          attributes: {
            uuids: uuids,
          },
        },
      }),
    });

    const body = (await response.json()) as ApiDeleteResponse;
    assertApiSuccess(response, body);

    return body.meta ?? null;
  } catch (error) {
    logErrorMessage(
      `deleteRecords["${uuids.join(', ')}"]`,
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
};
