import {
  assertApiSuccess,
  getApiToken,
  getBaseUrl,
  unwrapResourceAttributes,
} from '@/libs/api.js';
import { logErrorMessage } from '@/libs/errors.js';
import {
  ConflictStrategy,
  DEFAULT_CONFLICT_STRATEGY,
  DEFAULT_FRONTMATTER_ENABLED,
  normalizeAutoDelete,
  normalizeAutoSync,
  normalizeConflictStrategy,
  normalizeFrontmatterEnabled,
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
// outcome as a discriminated result. On any failure it logs and returns
// `{ ok: false }` so the caller can fall back conservatively instead of
// crashing the sync — the same resilient shape `fetchSources` uses.
export const fetchSettings = async (): Promise<SettingsReadResult> => {
  try {
    const response = await fetch(`${getBaseUrl()}/api/settings`, {
      headers: {
        Authorization: `Bearer ${getApiToken()}`,
      },
    });

    const body = (await response.json()) as UserSettingsApiResponse;

    assertApiSuccess(response, body);

    return { ok: true, settings: unwrapResourceAttributes(body) };
  } catch (error) {
    logErrorMessage(
      'fetchSettings',
      error instanceof Error ? error.message : String(error),
    );

    return { ok: false };
  }
};

// The subset of settings the default sync acts on, already resolved to safe
// values.
export type ResolvedSyncSettings = {
  conflictStrategy: ConflictStrategy;
  autoDelete: boolean;
  autoSync: boolean;
  includeFrontmatter: boolean;
};

// Collapses the "trust each field only if the read succeeded" decision into one
// place. A failed read is deliberately conservative: no auto-delete and no
// self-scheduling daemon without confirmed settings, but writes still happen
// with the safe suffix strategy and frontmatter on. A successful read defers
// each field to its normalizer, which falls back to markpost's schema default
// on a malformed value.
export const resolveSyncSettings = (
  result: SettingsReadResult,
): ResolvedSyncSettings => {
  if (!result.ok) {
    return {
      conflictStrategy: DEFAULT_CONFLICT_STRATEGY,
      autoDelete: false,
      autoSync: false,
      includeFrontmatter: DEFAULT_FRONTMATTER_ENABLED,
    };
  }

  return {
    conflictStrategy: normalizeConflictStrategy(
      result.settings?.conflictStrategy,
    ),
    autoDelete: normalizeAutoDelete(result.settings?.autoDelete),
    autoSync: normalizeAutoSync(result.settings?.autoSync),
    includeFrontmatter: normalizeFrontmatterEnabled(
      result.settings?.frontmatter,
    ),
  };
};
