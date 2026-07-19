import { formatErrorMessages, getApiToken, getBaseUrl } from '@/libs/api.js';
import { logErrorMessage } from '@/libs/errors.js';
import {
  ApiDeleteMeta,
  ApiError,
  ApiListResponse,
  ApiResponse,
} from '@/types/api.types.js';
import { CreateSourceInput, Source } from '@/types/sources.types.js';

// The server always responds with `{ data: { errors } }` on failure,
// regardless of endpoint, even where the success shape's `data` is an
// array (e.g. the sources list). This narrow type reads just that error
// shape off a response body of unknown success shape.
type ApiErrorBody = { data?: { errors?: ApiError[] } };

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
    const errorBody = body as ApiErrorBody;
    throw new Error(formatErrorMessages(errorBody.data?.errors ?? []));
  }

  return body;
};

export const fetchSources = async (): Promise<Source[]> => {
  try {
    const body = (await authedSourcesRequest(
      '/api/sources',
    )) as ApiListResponse;

    return (body.data ?? []).map(({ attributes }) => attributes) as Source[];
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
    })) as ApiResponse;

    return body.data?.attributes ? (body.data.attributes as Source) : null;
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
    })) as ApiResponse;

    return body.meta ? (body.meta as ApiDeleteMeta) : null;
  } catch (error) {
    logErrorMessage(
      `deleteSource["${uuid}"]`,
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
};
