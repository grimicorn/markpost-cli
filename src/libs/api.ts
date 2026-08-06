import { config } from '@/libs/config.js';
import { ApiError, ApiErrorEnvelope, ApiResponse } from '@/types/api.types.js';
import { logErrorMessage } from '@/libs/errors.js';

export const getBaseUrl = () => {
  return process.env.BASE_URL ?? 'https://sync.danholloran.me';
};

export const getApiToken = () => {
  return process.env.API_TOKEN ?? config.get('apiToken');
};

// How long any API request may stall before it's aborted. Without this a
// hung connection blocks the sync — and any unattended cron run — forever;
// `AbortSignal.timeout` makes a stalled request fail loud instead.
export const API_REQUEST_TIMEOUT_MS = 30_000;

// A timeout must be distinguishable from an ordinary API failure so it
// surfaces as its own clear message (fail loud) rather than being logged as
// a generic error or collapsing into a silent empty result.
export class ApiTimeoutError extends Error {
  constructor(url: string) {
    super(`Request to ${url} timed out after ${API_REQUEST_TIMEOUT_MS}ms`);
    this.name = 'ApiTimeoutError';
  }
}

// A cause chain should never be circular, but a self-referential `cause`
// would spin `isTimeoutAbort` forever — an unacceptable failure mode for the
// helper whose whole purpose is preventing hangs. Bound the walk instead.
const MAX_CAUSE_DEPTH = 8;

// `apiFetch` owns the only signal on these requests (it takes
// `Omit<…, 'signal'>`), so *any* abort is the timeout firing. `AbortSignal
// .timeout` aborts with a `TimeoutError` DOMException, but undici doesn't
// always surface that bare — a mid-body abort can come back as a `TypeError`
// ("terminated") with the real reason on `.cause`, and some paths report a
// plain `AbortError`. Match either abort name, walking the (bounded) cause
// chain, and let every unrelated rejection pass through untouched.
const ABORT_ERROR_NAMES = new Set(['TimeoutError', 'AbortError']);

const isTimeoutAbort = (error: unknown): boolean => {
  let current: unknown = error;

  for (
    let depth = 0;
    current instanceof Error && depth < MAX_CAUSE_DEPTH;
    depth++
  ) {
    if (ABORT_ERROR_NAMES.has(current.name)) {
      return true;
    }

    current = current.cause;
  }

  return false;
};

export type ApiFetchResult = { response: Response; body: unknown };

// Single seam wrapping `fetch` (and the JSON read) with a request timeout so
// a stalled connection fails loud as `ApiTimeoutError` instead of hanging
// forever. Owns only the timeout + transport concern: callers still attach
// their own headers/body and run `assertApiSuccess` on the result. The
// signal is owned here (`Omit<..., 'signal'>`) so a caller can't silently
// override the timeout.
export const apiFetch = async (
  url: string,
  init: Omit<RequestInit, 'signal'> = {},
): Promise<ApiFetchResult> => {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
    });
    const body = await response.json();

    return { response, body };
  } catch (error) {
    if (isTimeoutAbort(error)) {
      throw new ApiTimeoutError(url);
    }

    throw error;
  }
};

// Guard for the resilient per-call catches that otherwise downgrade any
// failure to an empty result: a timeout must escape them so the sync fails
// loud (non-zero exit) rather than reporting "nothing to fetch". Call this
// first in those catches — it re-throws a timeout and returns for every
// other error, letting the caller fall through to its conservative fallback.
export const rethrowIfTimeout = (error: unknown): void => {
  if (error instanceof ApiTimeoutError) {
    throw error;
  }
};

// The one way to report a failed API call from a resilient catch: re-throw a
// timeout (fail loud) and log every other error. Bundling both halves means
// a new call site can't log-and-swallow a timeout by forgetting the rethrow,
// and removes the `error instanceof Error ? ...` extraction repeated at
// every catch. Callers still return their own conservative fallback after.
export const logApiFailure = (context: string, error: unknown): void => {
  rethrowIfTimeout(error);

  logErrorMessage(
    context,
    error instanceof Error ? error.message : String(error),
  );
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

// An off-contract body can send `errors` as something other than an array
// (an object, a string, `null`) — spreading that directly would throw
// `TypeError: ... is not iterable` out of `assertApiSuccess` and surface a
// JS internals message instead of the server's actual error detail (or, for
// a string, spread into per-character entries and format as garbage).
// Falling back to `[]` for anything non-array keeps the "no errors present"
// path honest without crashing on a malformed field.
const toErrorArray = (value: unknown): ApiError[] =>
  Array.isArray(value) ? value : [];

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
    ...toErrorArray(envelope?.data?.errors),
    ...toErrorArray(envelope?.errors),
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
