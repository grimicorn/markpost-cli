import { config } from '@/libs/config.js';
import { ApiError, ApiErrorEnvelope, ApiResponse } from '@/types/api.types.js';
import { logErrorMessage } from '@/libs/errors.js';

export const getBaseUrl = () => {
  return process.env.BASE_URL ?? 'https://sync.danholloran.me';
};

export const getApiToken = () => {
  return process.env.API_TOKEN ?? config.get('apiToken');
};

export const formatErrorMessages = (errors: ApiError[]) => {
  if (errors.length === 1) {
    return `${errors?.[0]?.title}: ${errors?.[0]?.detail}`;
  }

  if (errors.length > 1) {
    return errors
      .map((error) => `- ${error.title}: ${error.detail}`)
      .join('\n');
  }

  return 'Unknown error occurred';
};

// Every error response the API sends back is a non-2xx status carrying
// `data.errors`, regardless of whether the success shape is a single
// resource or a list; markpost's declared contract also allows a top-level
// `errors` field as an alternative shape (see `ApiErrorEnvelope`). Accept
// `unknown` so this works for both response shapes without callers needing
// to reshape their body first.
export const assertApiSuccess = (response: Response, body: unknown): void => {
  const envelope = body as ApiErrorEnvelope | undefined;
  // Combine both shapes rather than falling back from one to the other:
  // `??` would let a present-but-empty `data.errors: []` mask a populated
  // top-level `errors`, silently passing a body that carries both.
  const errors = [
    ...(envelope?.data?.errors ?? []),
    ...(envelope?.errors ?? []),
  ];
  const hasErrors = errors.length > 0;

  if (!response.ok || hasErrors) {
    throw new Error(formatErrorMessages(errors));
  }
};

// Reads the `attributes` off a single-resource success response. Callers
// should run this only after `assertApiSuccess` has already ruled out the
// errors branch. The `?? null` covers every way this can come back empty —
// `data` missing entirely, `data` explicitly `null`, or (an off-contract
// response) a resource object with no `attributes` — collapsing all of them
// to the same `null` the return type promises, rather than leaking
// `undefined` in the last case.
export const unwrapResourceAttributes = <
  TResource extends { attributes: unknown },
>(
  body: ApiResponse<TResource | null>,
): TResource['attributes'] | null => body.data?.attributes ?? null;

// Reads the `attributes` off every resource in a list-success response,
// dropping (and loudly logging) any resource that's off-contract — no
// `attributes` at all, or `attributes` explicitly `null`. `!= null` catches
// both in one check. `context` identifies the caller in the log line (e.g.
// `fetchPaginatedRecords`, `fetchSources`) so a skip is traceable back to
// the request that produced it.
export const unwrapResourceCollection = <
  TResource extends { attributes: unknown },
>(
  context: string,
  body: ApiResponse<TResource[]>,
  label: string,
): TResource['attributes'][] => {
  const resources = body.data ?? [];
  const usableResources = resources.filter(
    (resource) => resource?.attributes != null,
  );

  if (usableResources.length !== resources.length) {
    logErrorMessage(
      context,
      `Skipped ${resources.length - usableResources.length} ${label}(s) with no attributes`,
    );
  }

  return usableResources.map(({ attributes }) => attributes);
};
