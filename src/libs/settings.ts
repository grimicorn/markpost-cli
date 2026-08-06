import {
  apiFetch,
  assertApiSuccess,
  getApiToken,
  getBaseUrl,
  logApiFailure,
  unwrapResourceAttributes,
} from '@/libs/api.js';
import {
  UserSettings,
  UserSettingsApiResponse,
} from '@/types/settings.types.js';

// A read either succeeded (`ok: true`) or failed. On success `settings` may
// still be `null` — a valid `{ data: null }` body for an account with no
// saved settings row yet, which means "use defaults", NOT "read failed".
// Overloading a bare `null` for both would make a transient failure
// indistinguishable from an untouched account; the caller must treat those
// differently (a failure must not enable the irreversible auto-delete).
export type SettingsReadResult =
  { ok: true; settings: UserSettings | null } | { ok: false };

// Single seam for reading the settings API: attaches auth, throws with the
// server's real error detail on failure (via `assertApiSuccess`, so a 2xx
// response that still carries `errors` is caught here too), and reports the
// outcome as a discriminated result. On any failure except a request timeout
// it logs and returns `{ ok: false }` so the caller can fall back
// conservatively instead of crashing the sync — the same resilient shape
// `fetchSources` uses. A timeout propagates (see `logApiFailure`) so a
// stalled read fails loud rather than silently defaulting settings.
export const fetchSettings = async (): Promise<SettingsReadResult> => {
  try {
    const { response, body } = await apiFetch(`${getBaseUrl()}/api/settings`, {
      headers: {
        Authorization: `Bearer ${getApiToken()}`,
      },
    });

    assertApiSuccess(response, body);

    return {
      ok: true,
      settings: unwrapResourceAttributes(body as UserSettingsApiResponse),
    };
  } catch (error) {
    logApiFailure('fetchSettings', error);

    return { ok: false };
  }
};
