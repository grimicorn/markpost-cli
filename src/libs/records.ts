import { assertApiSuccess, getApiToken, getBaseUrl } from '@/libs/api.js';
import { logErrorMessage } from '@/libs/errors.js';
import {
  ApiDeleteMeta,
  ApiListResponse,
  ApiResponse,
} from '@/types/api.types.js';
import { Record, PaginatedRecordsMeta } from '@/types/records.types.js';

export const fetchAllRecords = async (): Promise<Record[]> => {
  const initial = await fetchPaginatedRecords();

  if (!initial) {
    return [];
  }

  if (initial?.meta?.pageCount === 1) {
    return initial.records;
  }

  let number = initial?.meta?.page + 1;
  const records = [initial.records];
  while (number <= initial?.meta?.pageCount) {
    const subsequent = await fetchPaginatedRecords(number);

    if (!subsequent) {
      break;
    }

    number = subsequent?.meta?.page + 1;
    records.push(subsequent.records);
  }

  return records.flat(1) as Record[];
};

export const fetchPaginatedRecords = async (
  number: number = 1,
  size: number = 100,
): Promise<{
  records: Record[];
  meta: PaginatedRecordsMeta;
} | null> => {
  try {
    const response = await fetch(
      `${getBaseUrl()}/api/records?page[number]=${number}&page[size]=${size}`,
      {
        headers: {
          Authorization: `Bearer ${getApiToken()}`,
        },
      },
    );

    const body = (await response.json()) as ApiListResponse;

    assertApiSuccess(response, body);

    return {
      records: body.data?.map(({ attributes }) => attributes) as Record[],
      meta: body.meta as PaginatedRecordsMeta,
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
    assertApiSuccess(response, body);

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

    assertApiSuccess(response, body);

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
    assertApiSuccess(response, body);

    return body.meta ? (body.meta as ApiDeleteMeta) : null;
  } catch (error) {
    logErrorMessage(
      `deleteRecords["${uuids.join(', ')}"]`,
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
};
