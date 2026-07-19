import { formatErrorMessages, getApiToken, getBaseUrl } from '@/libs/api.js';
import { logErrorMessage } from '@/libs/errors.js';
import {
  ApiDeleteMeta,
  ApiListResponse,
  ApiResponse,
} from '@/types/api.types.js';
import { CreateSourceInput, Source } from '@/types/sources.types.js';

export const fetchSources = async (): Promise<Source[]> => {
  try {
    const response = await fetch(`${getBaseUrl()}/api/sources`, {
      headers: {
        Authorization: `Bearer ${getApiToken()}`,
      },
    });

    const body = (await response.json()) as ApiListResponse;

    if (!response.ok) {
      throw new Error(formatErrorMessages([]));
    }

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
    const response = await fetch(`${getBaseUrl()}/api/sources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${getApiToken()}`,
      },
      body: JSON.stringify({
        data: {
          type: 'sources',
          attributes: input,
        },
      }),
    });

    const body = (await response.json()) as ApiResponse;
    if (!response.ok || body.data?.errors) {
      throw new Error(formatErrorMessages(body.data?.errors ?? []));
    }

    return body.data?.attributes ? (body.data?.attributes as Source) : null;
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
    const response = await fetch(`${getBaseUrl()}/api/sources/${uuid}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${getApiToken()}`,
      },
    });

    const body = (await response.json()) as ApiResponse;
    if (!response.ok || body.data?.errors) {
      throw new Error(formatErrorMessages(body.data?.errors ?? []));
    }

    return body.meta ? (body.meta as ApiDeleteMeta) : null;
  } catch (error) {
    logErrorMessage(
      `deleteSource["${uuid}"]`,
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
};
