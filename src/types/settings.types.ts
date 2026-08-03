import type { ApiResourceObject, ApiResponse } from '@/types/api.types.js';

// Mirrors markpost's user-settings contract by hand (markpost is the source
// of truth): `CONFLICT_STRATEGIES` comes from `server/utils/response.ts` and
// the resource shape from `userSettingsSerializer` in the same file. Keep in
// sync with markpost when that contract changes. Only the fields the CLI
// actually consumes are modelled as enums — `theme`/`accentColor` are carried
// as plain strings since the CLI never acts on them.
export const CONFLICT_STRATEGIES = ['suffix', 'overwrite', 'skip'] as const;
export type ConflictStrategy = (typeof CONFLICT_STRATEGIES)[number];

// markpost's schema defaults (server/db/schema.ts): the CLI falls back to
// these whenever GET /api/settings can't be read, so a transient settings
// failure behaves exactly like an untouched account rather than guessing.
export const DEFAULT_CONFLICT_STRATEGY: ConflictStrategy = 'suffix';
export const DEFAULT_AUTO_DELETE = true;
export const DEFAULT_AUTO_SYNC = true;
export const DEFAULT_FRONTMATTER_ENABLED = true;

// The attributes markpost's `userSettingsSerializer` returns. `updatedAt` is
// a `Date` server-side but arrives as an ISO string over the wire, matching
// how `createdAt` is typed on `Record`. `conflictStrategy`/`theme` are plain
// strings on the wire (the server types them as `string`), so treat them as
// untrusted and narrow before use — see `normalizeConflictStrategy`.
export type UserSettings = {
  userId: string;
  vaultDir: string;
  filenameTemplate: string;
  // When true, the default sync self-schedules a repeat run (see
  // runSyncWithAutoSchedule); when false the CLI syncs once and exits.
  autoSync: boolean;
  autoDelete: boolean;
  frontmatter: boolean;
  conflictStrategy: string;
  theme: string;
  accentColor: string;
  updatedAt: string;
};

// The JSON:API resource object markpost's `userSettingsSerializer` produces:
// `attributes` plus the `type`/`id`/`links` envelope fields.
export type UserSettingsResource = ApiResourceObject & {
  type: 'user_settings';
  attributes: UserSettings;
};

export type UserSettingsApiResponse = ApiResponse<UserSettingsResource | null>;

export const isConflictStrategy = (
  value: string,
): value is ConflictStrategy => {
  return (CONFLICT_STRATEGIES as readonly string[]).includes(value);
};

// The wire value is an untrusted string; anything the CLI doesn't recognize
// (a strategy markpost added but this build predates, or a corrupt value)
// collapses to the documented default rather than throwing mid-sync.
export const normalizeConflictStrategy = (
  value: string | null | undefined,
): ConflictStrategy => {
  if (value != null && isConflictStrategy(value)) {
    return value;
  }

  return DEFAULT_CONFLICT_STRATEGY;
};

// `autoDelete` gates an irreversible server-side delete, so an off-contract
// wire value must not slip through as truthy (e.g. the string "false", which
// is truthy). Only an actual boolean is trusted; anything else falls back to
// the documented default.
export const normalizeAutoDelete = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  return DEFAULT_AUTO_DELETE;
};

// `autoSync` decides whether the CLI self-schedules another sync, so an
// off-contract wire value (e.g. the string "false", which is truthy) must not
// slip through as truthy. Only an actual boolean is trusted; anything else
// falls back to the documented default.
export const normalizeAutoSync = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  return DEFAULT_AUTO_SYNC;
};

// `frontmatter` gates whether synced files carry a YAML frontmatter block.
// As with the other flags, only a real boolean is trusted so an off-contract
// wire value can't flip the behavior; anything else falls back to the default.
export const normalizeFrontmatterEnabled = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  return DEFAULT_FRONTMATTER_ENABLED;
};
