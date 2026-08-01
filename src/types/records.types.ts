import type { ApiResourceObject, ApiResponse } from '@/types/api.types.js';

export type Record = {
  uuid: string;
  createdAt: string;
  title: string;
  content: string;
};

export type PaginatedRecordsMeta = {
  total: number;
  size: number;
  hasMore: boolean;
};

// The JSON:API resource object markpost's `recordSerializer`
// (`server/utils/response.ts`) actually produces for a record: `attributes`
// plus the `type`/`id`/`links` envelope fields the old `ApiData` type dropped.
export type RecordResource = ApiResourceObject & {
  type: 'records';
  attributes: Record;
};

export type RecordApiResponse = ApiResponse<RecordResource | null>;

export type RecordListApiResponse = ApiResponse<RecordResource[]>;
