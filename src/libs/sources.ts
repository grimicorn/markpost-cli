import {
  apiFetch,
  assertApiSuccess,
  getApiToken,
  getBaseUrl,
  logApiFailure,
  unwrapResourceAttributes,
  unwrapResourceCollection,
} from '@/libs/api.js';
import { ApiDeleteMeta, ApiDeleteResponse } from '@/types/api.types.js';
import {
  CreateSourceInput,
  Source,
  SourceApiResponse,
  SourceListApiResponse,
  UpdateSourceInput,
} from '@/types/sources.types.js';

// Single seam for talking to the sources API: attaches auth, throws with
// the server's real error detail on failure (via `assertApiSuccess`, so a
// 2xx response that still carries `errors` is caught here too, not just a
// non-2xx status), otherwise returns the parsed body for the caller to read
// in whatever shape (list, single, meta) it expects.
const authedSourcesRequest = async (
  path: string,
  init: Omit<RequestInit, 'signal'> = {},
): Promise<unknown> => {
  const { response, body } = await apiFetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiToken()}`,
      ...init.headers,
    },
  });

  assertApiSuccess(response, body);

  return body;
};

export const fetchSources = async (): Promise<Source[]> => {
  try {
    const body = (await authedSourcesRequest(
      '/api/sources',
    )) as SourceListApiResponse;

    return unwrapResourceCollection('fetchSources', body, 'source');
  } catch (error) {
    logApiFailure('fetchSources', error);

    return [];
  }
};

export const createSource = async (
  input: CreateSourceInput,
): Promise<Source | null> => {
  try {
    const body = (await authedSourcesRequest('/api/sources', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api+json',
      },
      body: JSON.stringify({
        data: {
          type: 'sources',
          attributes: input,
        },
      }),
    })) as SourceApiResponse;

    return unwrapResourceAttributes(body);
  } catch (error) {
    logApiFailure(`createSource["${input.name}"]`, error);

    return null;
  }
};

export const updateSource = async (
  uuid: string,
  input: UpdateSourceInput,
): Promise<Source | null> => {
  try {
    const body = (await authedSourcesRequest(
      `/api/sources/${encodeURIComponent(uuid)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/vnd.api+json',
        },
        body: JSON.stringify({
          data: {
            type: 'sources',
            attributes: input,
          },
        }),
      },
    )) as SourceApiResponse;

    return unwrapResourceAttributes(body);
  } catch (error) {
    logApiFailure(`updateSource["${uuid}"]`, error);

    return null;
  }
};

export const deleteSource = async (
  uuid: string,
): Promise<ApiDeleteMeta | null> => {
  try {
    const body = (await authedSourcesRequest(
      `/api/sources/${encodeURIComponent(uuid)}`,
      {
        method: 'DELETE',
      },
    )) as ApiDeleteResponse;

    return body.meta ?? null;
  } catch (error) {
    logApiFailure(`deleteSource["${uuid}"]`, error);

    return null;
  }
};
