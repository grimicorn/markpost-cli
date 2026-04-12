import {
  formatErrorMessages,
  getApiToken,
  getBaseUrl,
  logErrorMessage,
} from '@/libs/api.js';
import { ApiDeleteMeta, ApiResponse } from '@/types/api.types.js';

import { Record } from '@/types/records.types.js';

export const fetchRecords = async (
  number: number = 1,
  size: number = 100,
): Promise<Record[]> => {
  try {
    const response = await fetch(
      `${getBaseUrl()}/api/records?page[number]=${number}&page[size]=${size}`,
      {
        headers: {
          Authorization: `Bearer ${getApiToken()}`,
        },
      },
    );

    const body = (await response.json()) as ApiResponse;

    if (!response.ok || body.data?.errors) {
      throw new Error(formatErrorMessages(body.data?.errors ?? []));
    }

    return body.data ? (body.data as Record[]) : [];
  } catch (error) {
    logErrorMessage(
      `recordsIndex`,
      error instanceof Error ? error.message : String(error),
    );

    return [];
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
