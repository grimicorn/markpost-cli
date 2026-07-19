import { formatErrorMessages, getApiToken, getBaseUrl } from '@/libs/api.js';
import { logErrorMessage } from '@/libs/errors.js';
import {
  ApiDeleteMeta,
  ApiLinks,
  ApiListResponse,
  ApiResponse,
} from '@/types/api.types.js';
import { Record, PaginatedRecordsMeta } from '@/types/records.types.js';

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

export const fetchAllRecords = async (): Promise<Record[]> => {
  const initial = await fetchPaginatedRecords();

  if (!initial) {
    return [];
  }

  const records = [initial.records];
  const seenCursors = new Set<string>();
  let after = extractAfterCursor(initial.links?.next);

  // `seenCursors` bounds the loop against any repeating cursor (not just an
  // immediate repeat), so a misbehaving server can't hang the CLI or produce
  // an unbounded stream of duplicate records.
  while (after && !seenCursors.has(after)) {
    seenCursors.add(after);
    const subsequent = await fetchPaginatedRecords(after);

    if (!subsequent) {
      break;
    }

    records.push(subsequent.records);
    after = extractAfterCursor(subsequent.links?.next);
  }

  return records.flat(1) as Record[];
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
  links: ApiLinks;
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

    const body = (await response.json()) as ApiListResponse;

    if (!response.ok) {
      throw new Error(formatErrorMessages([]));
    }

    return {
      records: body.data?.map(({ attributes }) => attributes) as Record[],
      meta: body.meta as PaginatedRecordsMeta,
      links: body.links ?? { next: null, prev: null },
    };
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

    const body = (await response.json()) as ApiResponse;
    if (!response.ok || body.data?.errors) {
      throw new Error(formatErrorMessages(body.data?.errors ?? []));
    }

    return body.data?.attributes ? (body.data?.attributes as Record) : null;
  } catch (error) {
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

    const body = (await response.json()) as ApiResponse;

    if (!response.ok || body.data?.errors) {
      throw new Error(formatErrorMessages(body.data?.errors ?? []));
    }

    return body.data?.attributes ? (body.data?.attributes as Record) : null;
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

    const body = (await response.json()) as ApiResponse;
    if (!response.ok || body.data?.errors) {
      throw new Error(formatErrorMessages(body.data?.errors ?? []));
    }

    return body.meta ? (body.meta as ApiDeleteMeta) : null;
  } catch (error) {
    logErrorMessage(
      `deleteRecords["${uuids.join(', ')}"]`,
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
};
