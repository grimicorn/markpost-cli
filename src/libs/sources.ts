import {
  formatErrorMessages,
  getApiToken,
  getBaseUrl,
  unwrapResourceAttributes,
} from '@/libs/api.js';
import { logErrorMessage } from '@/libs/errors.js';
import {
  ApiDeleteMeta,
  ApiDeleteResponse,
  ApiErrorEnvelope,
} from '@/types/api.types.js';
import {
  CreateSourceInput,
  Source,
  SourceApiResponse,
  SourceListApiResponse,
} from '@/types/sources.types.js';

// Single seam for talking to the sources API: attaches auth, throws with
// the server's real error detail on failure, otherwise returns the parsed
// body for the caller to read in whatever shape (list, single, meta) it
// expects.
const authedSourcesRequest = async (
  path: string,
  init: RequestInit = {},
): Promise<unknown> => {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiToken()}`,
      ...init.headers,
    },
  });

  const body = await response.json();

  if (!response.ok) {
    const errorBody = body as ApiErrorEnvelope;
    const errors = errorBody.data?.errors ?? errorBody.errors;
    throw new Error(formatErrorMessages(errors ?? []));
  }

  return body;
};

export const fetchSources = async (): Promise<Source[]> => {
  try {
    const body = (await authedSourcesRequest(
      '/api/sources',
    )) as SourceListApiResponse;

    const resources = body.data ?? [];

    return resources.map(({ attributes }) => attributes);
  } catch (error) {
    logErrorMessage(
      'fetchSources',
      error instanceof Error ? error.message : String(error),
    );

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
    logErrorMessage(
      `createSource["${input.name}"]`,
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
};

export const deleteSource = async (
  uuid: string,
): Promise<ApiDeleteMeta | null> => {
  try {
    const body = (await authedSourcesRequest(`/api/sources/${uuid}`, {
      method: 'DELETE',
    })) as ApiDeleteResponse;

    return body.meta ?? null;
  } catch (error) {
    logErrorMessage(
      `deleteSource["${uuid}"]`,
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
};
