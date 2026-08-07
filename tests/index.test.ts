import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Record } from '@/types/records.types.js';
import { UserSettings } from '@/types/settings.types.js';
import { SettingsReadResult } from '@/libs/settings.js';

vi.mock('@/libs/config.js', () => ({ checkConfig: vi.fn() }));
vi.mock('@/libs/records.js', () => ({ fetchAllRecords: vi.fn(), deleteRecords: vi.fn() }));
vi.mock('@/libs/markdown.js', () => ({ writeMarkdown: vi.fn() }));
vi.mock('@/libs/settings.js', () => ({ fetchSettings: vi.fn() }));
vi.mock('@/commands/push.js', () => ({
  runPushCommand: vi.fn(),
  USAGE: 'Usage: markpost push <path...>',
}));
vi.mock('@/commands/get.js', () => ({
  runGetCommand: vi.fn(),
  USAGE: 'Usage: markpost get <uuid>',
}));
vi.mock('@/commands/sources.js', () => ({
  runSourcesCommand: vi.fn(),
  USAGE: 'Usage: markpost sources <list|create|update|delete> [uuid]',
}));
vi.mock('@/commands/records.js', () => ({
  runRecordsCommand: vi.fn(),
  USAGE: 'Usage: markpost records <list>',
}));
vi.mock('yocto-spinner', () => ({ default: vi.fn() }));
vi.mock('cli-spinners', () => ({ default: { dots: {} } }));
vi.mock('chalk', () => ({
  default: {
    redBright: vi.fn((s: unknown) => s),
    dim: vi.fn((s: unknown) => s),
    yellow: vi.fn((s: unknown) => s),
  },
}));

const mockRecord: Record = {
  uuid: 'abc-123',
  title: 'Test Title',
  content: 'Test Content',
  createdAt: '2024-01-01T00:00:00Z',
};

describe('index', () => {
  let mockSpinner: { start: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockSpinner = { start: vi.fn(), success: vi.fn(), error: vi.fn() };
    // The sync now runs only under the explicit `sync` subcommand, so the
    // default-sync tests below invoke it that way. Dispatch, help, and
    // no-arg tests override process.argv themselves.
    process.argv = ['node', 'index.js', 'sync'];
    process.exitCode = undefined;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = undefined;
    vi.restoreAllMocks();
    process.argv = originalArgv;
  });

  it('dispatches to runSourcesCommand and skips the sync flow when the "sources" command is given', async () => {
    process.argv = [...originalArgv.slice(0, 2), 'sources', 'list'];
    const { runSourcesCommand } = await import('@/commands/sources.js');
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');
    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);

    await import('@/index.js');

    expect(runSourcesCommand).toHaveBeenCalledWith(['list']);
    expect(fetchAllRecords).not.toHaveBeenCalled();
    expect(mockSpinner.start).not.toHaveBeenCalled();
  });

  it('dispatches to runRecordsCommand and skips the sync flow when the "records" command is given', async () => {
    process.argv = [...originalArgv.slice(0, 2), 'records', 'list'];
    const { runRecordsCommand } = await import('@/commands/records.js');
    const { fetchAllRecords, deleteRecords } = await import(
      '@/libs/records.js'
    );
    const { default: yoctoSpinner } = await import('yocto-spinner');
    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);

    await import('@/index.js');

    expect(runRecordsCommand).toHaveBeenCalledWith(['list']);
    expect(fetchAllRecords).not.toHaveBeenCalled();
    expect(deleteRecords).not.toHaveBeenCalled();
    expect(mockSpinner.start).not.toHaveBeenCalled();
  });

  it('dispatches to runPushCommand and skips the default sync when the push command is given', async () => {
    process.argv = ['node', 'index.js', 'push', './notes/test.md'];
    const { runPushCommand } = await import('@/commands/push.js');
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    await import('@/index.js');

    expect(runPushCommand).toHaveBeenCalledWith(['./notes/test.md']);
    expect(fetchAllRecords).not.toHaveBeenCalled();
    expect(yoctoSpinner).not.toHaveBeenCalled();
  });

  it('dispatches to runGetCommand and skips the default sync when the get command is given', async () => {
    process.argv = ['node', 'index.js', 'get', 'abc-123'];
    const { runGetCommand } = await import('@/commands/get.js');
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    await import('@/index.js');

    expect(runGetCommand).toHaveBeenCalledWith(['abc-123']);
    expect(fetchAllRecords).not.toHaveBeenCalled();
    expect(yoctoSpinner).not.toHaveBeenCalled();
  });

  it('errors out on an unrecognized command instead of falling through to the default sync', async () => {
    process.argv = ['node', 'index.js', 'puhs', 'file.md'];
    const { runPushCommand } = await import('@/commands/push.js');
    const { runGetCommand } = await import('@/commands/get.js');
    const { runSourcesCommand } = await import('@/commands/sources.js');
    const { runRecordsCommand } = await import('@/commands/records.js');
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    await import('@/index.js');

    expect(runPushCommand).not.toHaveBeenCalled();
    expect(runGetCommand).not.toHaveBeenCalled();
    expect(runSourcesCommand).not.toHaveBeenCalled();
    expect(runRecordsCommand).not.toHaveBeenCalled();
    expect(fetchAllRecords).not.toHaveBeenCalled();
    expect(deleteRecords).not.toHaveBeenCalled();
    expect(yoctoSpinner).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown command: puhs'),
    );
    expect(process.exitCode).toBe(1);
  });

  it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__'])(
    'treats "%s" as an unknown command rather than resolving it off Object.prototype',
    async (command) => {
      process.argv = ['node', 'index.js', command];
      const { runPushCommand } = await import('@/commands/push.js');
      const { runGetCommand } = await import('@/commands/get.js');
      const { runSourcesCommand } = await import('@/commands/sources.js');
      const { runRecordsCommand } = await import('@/commands/records.js');
      const { fetchAllRecords } = await import('@/libs/records.js');

      await import('@/index.js');

      expect(runPushCommand).not.toHaveBeenCalled();
      expect(runGetCommand).not.toHaveBeenCalled();
      expect(runSourcesCommand).not.toHaveBeenCalled();
      expect(runRecordsCommand).not.toHaveBeenCalled();
      expect(fetchAllRecords).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining(`Unknown command: ${command}`),
      );
      expect(process.exitCode).toBe(1);
    },
  );

  it.each(['--help', 'help', '-h'])(
    'prints aggregated usage and exits 0 for "%s" without touching the sync',
    async (helpFlag) => {
      process.argv = ['node', 'index.js', helpFlag];
      const { fetchAllRecords, deleteRecords } = await import(
        '@/libs/records.js'
      );
      const { default: yoctoSpinner } = await import('yocto-spinner');

      await import('@/index.js');

      // Aggregates every subcommand's own USAGE string.
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: markpost sync'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: markpost push'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: markpost get'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: markpost sources'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: markpost records'),
      );
      expect(fetchAllRecords).not.toHaveBeenCalled();
      expect(deleteRecords).not.toHaveBeenCalled();
      expect(yoctoSpinner).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    },
  );

  it('prints only the targeted command usage for "help <command>"', async () => {
    process.argv = ['node', 'index.js', 'help', 'sync'];

    await import('@/index.js');

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Usage: markpost sync'),
    );
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining('Usage: markpost push'),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('falls back to the full help for an unknown help topic', async () => {
    process.argv = ['node', 'index.js', 'help', 'bogus'];

    await import('@/index.js');

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Usage: markpost <command>'),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('prints help, fails loud, and never runs the destructive sync when invoked with no arguments', async () => {
    process.argv = ['node', 'index.js'];
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    await import('@/index.js');

    // A bare invocation is a missing-command error: help goes to stderr and
    // the exit code is non-zero so a cron job or wrapper can't "succeed"
    // while silently syncing nothing.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Usage: markpost <command>'),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('No command given'),
    );
    expect(process.exitCode).toBe(1);
    // The whole point of the fix: a bare invocation must not fetch, write, or
    // delete anything.
    expect(fetchAllRecords).not.toHaveBeenCalled();
    expect(writeMarkdown).not.toHaveBeenCalled();
    expect(deleteRecords).not.toHaveBeenCalled();
    expect(yoctoSpinner).not.toHaveBeenCalled();
  });

  it.each(['--help', '-h'])(
    'prints sync usage instead of syncing for "sync %s"',
    async (helpFlag) => {
      process.argv = ['node', 'index.js', 'sync', helpFlag];
      const { fetchAllRecords, deleteRecords } = await import(
        '@/libs/records.js'
      );
      const { default: yoctoSpinner } = await import('yocto-spinner');

      await import('@/index.js');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Usage: markpost sync'),
      );
      expect(fetchAllRecords).not.toHaveBeenCalled();
      expect(deleteRecords).not.toHaveBeenCalled();
      expect(yoctoSpinner).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    },
  );

  it.each([
    ['push', '--help'],
    ['get', '-h'],
    ['sources', '--help'],
    ['records', '-h'],
  ])(
    'prints %s usage for "%s %s" without invoking the command handler',
    async (name, helpFlag) => {
      process.argv = ['node', 'index.js', name, helpFlag];
      const pushModule = await import('@/commands/push.js');
      const getModule = await import('@/commands/get.js');
      const sourcesModule = await import('@/commands/sources.js');
      const recordsModule = await import('@/commands/records.js');

      await import('@/index.js');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(`Usage: markpost ${name}`),
      );
      // A help flag must short-circuit before the handler runs, so no config
      // check or API call happens.
      expect(pushModule.runPushCommand).not.toHaveBeenCalled();
      expect(getModule.runGetCommand).not.toHaveBeenCalled();
      expect(sourcesModule.runSourcesCommand).not.toHaveBeenCalled();
      expect(recordsModule.runRecordsCommand).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    },
  );

  it('errors and skips the sync when the sync command is given unexpected arguments', async () => {
    process.argv = ['node', 'index.js', 'sync', 'oops'];
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    await import('@/index.js');

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Unexpected arguments: oops'),
    );
    expect(process.exitCode).toBe(1);
    expect(fetchAllRecords).not.toHaveBeenCalled();
    expect(deleteRecords).not.toHaveBeenCalled();
    expect(yoctoSpinner).not.toHaveBeenCalled();
  });

  it('runs the sync only under the explicit "sync" command', async () => {
    process.argv = ['node', 'index.js', 'sync'];
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings());
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [mockRecord], partial: false });
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(fetchAllRecords).toHaveBeenCalled();
    expect(deleteRecords).toHaveBeenCalledWith(['abc-123']);
  });

  it('fetches all records and writes each as markdown', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings());
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [mockRecord], partial: false });
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(mockSpinner.start).toHaveBeenCalledWith('Fetching records...');
    expect(fetchAllRecords).toHaveBeenCalled();
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'suffix', expect.any(Set));
    expect(mockSpinner.success).toHaveBeenCalledWith('Fetched 1 records!');
    expect(mockSpinner.start).toHaveBeenCalledWith('Writing records...');
    expect(mockSpinner.success).toHaveBeenCalledWith('Wrote 1 records!');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('/mock/output/test-title.md'),
    );
    expect(mockSpinner.start).toHaveBeenCalledWith('Deleting records...');
    expect(deleteRecords).toHaveBeenCalledWith(['abc-123']);
  });

  it('writes one markdown file per record', async () => {
    const mockRecord2: Record = { uuid: 'def-456', title: 'Title 2', content: 'Content 2', createdAt: '2024-01-02T00:00:00Z' };
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings());
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [mockRecord, mockRecord2], partial: false });
    vi.mocked(writeMarkdown)
      .mockReturnValueOnce('/mock/output/test-title.md')
      .mockReturnValueOnce('/mock/output/title-2.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(writeMarkdown).toHaveBeenCalledTimes(2);
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'suffix', expect.any(Set));
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord2, 'suffix', expect.any(Set));
    // The whole reason seenSlugs is threaded is that every record in a batch
    // shares one Set — assert the exact same instance reaches both calls, so
    // a regression to a per-record Set (which would disable the overwrite
    // clobber guard) fails here.
    const [firstCall, secondCall] = vi.mocked(writeMarkdown).mock.calls;
    expect(secondCall[2]).toBe(firstCall[2]);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('/mock/output/test-title.md'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('/mock/output/title-2.md'),
    );
    expect(deleteRecords).toHaveBeenCalledWith(['abc-123', 'def-456']);
  });

  it('exits early when no records are fetched', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [], partial: false });

    await import('@/index.js');

    expect(mockSpinner.success).toHaveBeenCalledWith('No new records, exiting...');
    expect(writeMarkdown).not.toHaveBeenCalled();
    expect(deleteRecords).not.toHaveBeenCalled();
  });

  // A failed fetch (`ok: false`) must fail loud with a non-zero exit — never
  // report "No new records" and exit 0, which would silently mask a broken
  // sync in cron (issue #63). It must also write and delete nothing.
  it('fails loud and exits non-zero when the record fetch fails', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings());
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: false });

    await import('@/index.js');

    // Pin the fail-loud branch specifically: assert its exact message rather
    // than a bare `spinner.error` call, so deleting this branch (and letting
    // the generic catch's "Something went wrong!" fire instead) fails here.
    expect(mockSpinner.error).toHaveBeenCalledWith(
      'Failed to fetch records from the server — nothing synced.',
    );
    expect(mockSpinner.success).not.toHaveBeenCalledWith(
      'No new records, exiting...',
    );
    expect(writeMarkdown).not.toHaveBeenCalled();
    expect(deleteRecords).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  // A partial read (a later page failed mid-pagination) must fail loud too —
  // exit non-zero and mark the spinner errored — while still syncing the pages
  // that were fetched, so cron never treats a truncated sync as clean.
  it('fails loud but still syncs the fetched pages on a partial fetch', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings());
    vi.mocked(fetchAllRecords).mockResolvedValue({
      ok: true,
      records: [mockRecord],
      partial: true,
    });
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(mockSpinner.error).toHaveBeenCalledWith(
      expect.stringContaining('a later page failed'),
    );
    expect(mockSpinner.success).not.toHaveBeenCalledWith(
      'No new records, exiting...',
    );
    // The fetched page is still written and (with autoDelete on) deleted.
    expect(writeMarkdown).toHaveBeenCalledWith(
      mockRecord,
      'suffix',
      expect.any(Set),
    );
    expect(deleteRecords).toHaveBeenCalledWith(['abc-123']);
    // The run ends on the truncation warning, not the green delete-success line.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Sync was incomplete'),
    );
    expect(process.exitCode).toBe(1);
  });

  // A partial read that fetched zero records must fail loud and return without
  // running the write path (no confusing "Wrote 0 records!" after the error).
  it('fails loud and writes nothing on a partial fetch that returned no records', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings());
    vi.mocked(fetchAllRecords).mockResolvedValue({
      ok: true,
      records: [],
      partial: true,
    });

    await import('@/index.js');

    expect(mockSpinner.error).toHaveBeenCalledWith(
      expect.stringContaining('a later page failed'),
    );
    expect(mockSpinner.success).not.toHaveBeenCalledWith(
      'No new records, exiting...',
    );
    expect(writeMarkdown).not.toHaveBeenCalled();
    expect(deleteRecords).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('calls spinner.error and logs to console.error when fetchAllRecords throws', async () => {
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchAllRecords).mockRejectedValue(new Error('Network error'));

    await import('@/index.js');

    expect(mockSpinner.error).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  const mockSettings = (
    overrides: Partial<UserSettings> = {},
  ): SettingsReadResult => ({
    ok: true,
    settings: {
      userId: 'user-1',
      vaultDir: '',
      filenameTemplate: '',
      autoSync: true,
      autoDelete: true,
      frontmatter: true,
      conflictStrategy: 'suffix',
      theme: 'system',
      accentColor: '#a855f7',
      updatedAt: '2024-01-01T00:00:00Z',
      ...overrides,
    },
  });

  it('writes records but skips the delete and warns when settings cannot be read', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue({ ok: false });
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [mockRecord], partial: false });
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');

    await import('@/index.js');

    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'suffix', expect.any(Set));
    expect(mockSpinner.success).toHaveBeenCalledWith('Wrote 1 records!');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Could not read settings'),
    );
    expect(mockSpinner.start).not.toHaveBeenCalledWith('Deleting records...');
    expect(deleteRecords).not.toHaveBeenCalled();
  });

  it("passes the user's conflict strategy from settings to writeMarkdown", async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ conflictStrategy: 'overwrite' }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [mockRecord], partial: false });
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'overwrite', expect.any(Set));
  });

  it('normalizes an unknown conflict strategy from settings to suffix', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ conflictStrategy: 'bogus-value' }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [mockRecord], partial: false });
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'suffix', expect.any(Set));
  });

  it('does not delete records when autoDelete is false', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoDelete: false }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [mockRecord], partial: false });
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');

    await import('@/index.js');

    expect(mockSpinner.success).toHaveBeenCalledWith('Wrote 1 records!');
    expect(mockSpinner.start).not.toHaveBeenCalledWith('Deleting records...');
    expect(deleteRecords).not.toHaveBeenCalled();
  });

  it('deletes records when autoDelete is true', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoDelete: true }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [mockRecord], partial: false });
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(deleteRecords).toHaveBeenCalledWith(['abc-123']);
  });

  it('excludes skipped records (null write result) from the delete call', async () => {
    const mockRecord2: Record = { uuid: 'def-456', title: 'Title 2', content: 'Content 2', createdAt: '2024-01-02T00:00:00Z' };
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ conflictStrategy: 'skip' }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [mockRecord, mockRecord2], partial: false });
    vi.mocked(writeMarkdown)
      .mockReturnValueOnce('/mock/output/test-title.md')
      .mockReturnValueOnce(null);
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(mockSpinner.success).toHaveBeenCalledWith('Wrote 1 records!');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Skipped 1 record(s)'),
    );
    expect(deleteRecords).toHaveBeenCalledWith(['abc-123']);
  });

  it('does not issue a delete request when every record was skipped', async () => {
    const mockRecord2: Record = { uuid: 'def-456', title: 'Title 2', content: 'Content 2', createdAt: '2024-01-02T00:00:00Z' };
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ conflictStrategy: 'skip' }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [mockRecord, mockRecord2], partial: false });
    vi.mocked(writeMarkdown).mockReturnValue(null);

    await import('@/index.js');

    expect(mockSpinner.success).toHaveBeenCalledWith('Wrote 0 records!');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Skipped 2 record(s)'),
    );
    expect(mockSpinner.start).not.toHaveBeenCalledWith('Deleting records...');
    expect(deleteRecords).not.toHaveBeenCalled();
  });

  it('reports a delete failure loudly instead of claiming success', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings());
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [mockRecord], partial: false });
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue(null);

    await import('@/index.js');

    expect(deleteRecords).toHaveBeenCalledWith(['abc-123']);
    expect(mockSpinner.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete records'),
    );
    expect(mockSpinner.success).not.toHaveBeenCalledWith(
      expect.stringContaining('Deleted'),
    );
    expect(process.exitCode).toBe(1);
  });
});
