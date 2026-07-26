import type { ApiResourceObject, ApiResponse } from '@/types/api.types.js';

export const SOURCE_TYPES = [
  'webhook',
  'email',
  'stripe',
  'github',
  'zapier',
  'rss',
  'shortcuts',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export type Source = {
  uuid: string;
  createdAt: string;
  type: SourceType;
  name: string;
  provider: string | null;
  endpointSlug: string;
  routeFolder: string;
  lastHitAt: string | null;
  recordCount: number;
};

export type CreateSourceInput = {
  type: SourceType;
  name: string;
  routeFolder: string;
  provider?: string;
};

// The JSON:API resource object markpost's `sourceSerializer`
// (`server/utils/response.ts`) actually produces for a source: `attributes`
// plus the `type`/`id`/`links` envelope fields the old `ApiData` type dropped.
export type SourceResource = ApiResourceObject & {
  type: 'sources';
  attributes: Source;
};

export type SourceApiResponse = ApiResponse<SourceResource | null>;

export type SourceListApiResponse = ApiResponse<SourceResource[]>;
