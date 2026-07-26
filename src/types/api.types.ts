// The generic envelope types below are re-exported from markpost's own
// contract (vendored in ./vendor/markpost-api.types.ts) rather than
// hand-mirrored, so the CLI can't silently drift from what the server
// actually sends. Run `npm run sync:contract` to refresh the vendored copy;
// see README.md#contract-sync.
export type {
  ApiError,
  ApiRequest,
  ApiResourceObject,
  ApiResponse,
} from '@/types/vendor/markpost-api.types.js';

import type { ApiError } from '@/types/vendor/markpost-api.types.js';

// CLI-only additions below: shapes markpost's handlers return that aren't
// (and don't need to be) part of the shared generic contract.

// The records and sources delete handlers (`server/api/records/index.delete.ts`,
// `server/api/sources/[uuid].delete.ts`) return `{ meta: { deleted } }` directly
// on success — not an `ApiResponse<T>` (there's no `data`/`errors` union member
// here, just a bare meta object). Their error path still goes through the same
// `apiErrorHandler`, so failures still arrive as `ApiErrorEnvelope` (below).
export type ApiDeleteMeta = {
  deleted: number;
};

export type ApiDeleteResponse = {
  meta: ApiDeleteMeta;
};

// The real error envelope every markpost endpoint sends on failure, regardless
// of the success shape. This is the wire format Nitro's error handler produces
// for a thrown `ApiError` (`throw createError({ statusCode, data: { errors } })`
// in markpost's `server/utils/errors.ts`), which nests `errors` under `data`.
//
// This deliberately does NOT match the `errors` branch of the vendored
// `ApiResponse<T>` union (`{ errors: ApiError[], data?: never }`) — that branch
// describes a handler's own return-type annotation, not what Nitro's error
// serialization actually puts on the wire for a non-2xx response. Modeling
// this as its own type (instead of two independent hand-rolled inline casts,
// which is what drifted before) keeps that distinction explicit in one place.
export type ApiErrorEnvelope = {
  data?: {
    errors?: ApiError[];
  };
};

// markpost's own `links` bag is a generic `Record<string, string | null>`
// (`ApiResponseBase.links` in the vendored contract), but every endpoint the
// CLI actually calls (`server/utils/pagination.ts` -> `paginationLinks`)
// narrows that down to exactly `next`/`prev`. This mirrors that real,
// observed shape rather than the fully generic bag.
export type ApiPaginationLinks = {
  next: string | null;
  prev?: string | null;
};
