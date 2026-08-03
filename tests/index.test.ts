import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Record } from '@/types/records.types.js';
import { UserSettings } from '@/types/settings.types.js';
import { SettingsReadResult } from '@/libs/settings.js';

vi.mock('@/libs/config.js', () => ({ checkConfig: vi.fn() }));
vi.mock('@/libs/records.js', () => ({ fetchAllRecords: vi.fn(), deleteRecords: vi.fn() }));
vi.mock('@/libs/markdown.js', () => ({ writeMarkdown: vi.fn() }));
// Keep the real resolveSyncSettings (the fallback logic under test) and only
// stub the network read.
vi.mock('@/libs/settings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/libs/settings.js')>();
  return { ...actual, fetchSettings: vi.fn() };
});
// Run the sync once synchronously instead of arming a real timer, and capture
// what runDefaultSync reports back so tests can assert the autoSync decision
// (a mock that discarded the return value would let a constant stand in for
// the resolver). Spread the real module so the interval constant stays in sync
// with scheduler.ts; the scheduling logic itself lives in
// tests/libs/scheduler.test.ts.
const scheduler = vi.hoisted(() => ({
  lastSyncResult: undefined as boolean | undefined,
  runSync: undefined as (() => Promise<boolean>) | undefined,
}));
vi.mock('@/libs/scheduler.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/libs/scheduler.js')>();
  return {
    ...actual,
    // Capture runSync so a test can drive extra iterations by hand (the real
    // scheduler would re-invoke it on a timer) and run the first iteration now.
    runSyncWithAutoSchedule: vi.fn(async (runSync: () => Promise<boolean>) => {
      scheduler.runSync = runSync;
      scheduler.lastSyncResult = await runSync();
    }),
  };
});
vi.mock('@/commands/push.js', () => ({ runPushCommand: vi.fn() }));
vi.mock('@/commands/get.js', () => ({ runGetCommand: vi.fn() }));
vi.mock('@/commands/sources.js', () => ({ runSourcesCommand: vi.fn() }));
vi.mock('@/commands/records.js', () => ({ runRecordsCommand: vi.fn() }));
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
    scheduler.lastSyncResult = undefined;
    scheduler.runSync = undefined;
    mockSpinner = { start: vi.fn(), success: vi.fn(), error: vi.fn() };
    process.argv = ['node', 'index.js'];
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

  it('fetches all records and writes each as markdown', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings());
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(mockSpinner.start).toHaveBeenCalledWith('Fetching records...');
    expect(fetchAllRecords).toHaveBeenCalled();
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'suffix', expect.any(Set), true);
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
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord, mockRecord2]);
    vi.mocked(writeMarkdown)
      .mockReturnValueOnce('/mock/output/test-title.md')
      .mockReturnValueOnce('/mock/output/title-2.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(writeMarkdown).toHaveBeenCalledTimes(2);
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'suffix', expect.any(Set), true);
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord2, 'suffix', expect.any(Set), true);
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
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    // autoSync off so this exercises the true "exiting" path (with autoSync on
    // the process stays alive and the message differs).
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoSync: false }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue([]);

    await import('@/index.js');

    expect(mockSpinner.success).toHaveBeenCalledWith('No new records, exiting...');
    expect(writeMarkdown).not.toHaveBeenCalled();
    expect(deleteRecords).not.toHaveBeenCalled();
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
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');

    await import('@/index.js');

    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'suffix', expect.any(Set), true);
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
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'overwrite', expect.any(Set), true);
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
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'suffix', expect.any(Set), true);
  });

  it('passes includeFrontmatter=false to writeMarkdown when the frontmatter setting is off', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ frontmatter: false }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(writeMarkdown).toHaveBeenCalledWith(
      mockRecord,
      'suffix',
      expect.any(Set),
      false,
    );
  });

  it('drives the default sync through the auto-sync scheduler', async () => {
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { runSyncWithAutoSchedule } = await import('@/libs/scheduler.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings());
    vi.mocked(fetchAllRecords).mockResolvedValue([]);

    await import('@/index.js');

    expect(runSyncWithAutoSchedule).toHaveBeenCalledWith(expect.any(Function));
  });

  it('reports autoSync on to the scheduler when the setting is enabled', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings({ autoSync: true }));
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(scheduler.lastSyncResult).toBe(true);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('autoSync is on'),
    );
  });

  it('reports autoSync off to the scheduler when the setting is disabled', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoSync: false }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(scheduler.lastSyncResult).toBe(false);
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining('autoSync is on'),
    );
  });

  it('reports autoSync off to the scheduler when settings cannot be read', async () => {
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue({ ok: false });
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');

    await import('@/index.js');

    expect(scheduler.lastSyncResult).toBe(false);
    // With no prior good read, a failed read writes with conservative defaults:
    // suffix strategy and frontmatter on.
    expect(writeMarkdown).toHaveBeenCalledWith(
      mockRecord,
      'suffix',
      expect.any(Set),
      true,
    );
  });

  it('reuses the last confirmed format when a later iteration cannot read settings', async () => {
    const mockRecord2: Record = {
      uuid: 'def-456',
      title: 'Second',
      content: 'Second body',
      createdAt: '2024-01-02T00:00:00Z',
    };
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    // Iteration 1 confirms frontmatter off + overwrite strategy.
    vi.mocked(fetchSettings).mockResolvedValueOnce(
      mockSettings({
        autoSync: true,
        autoDelete: false,
        frontmatter: false,
        conflictStrategy: 'overwrite',
      }),
    );
    // Iteration 2's settings read blips.
    vi.mocked(fetchSettings).mockResolvedValue({ ok: false });
    vi.mocked(fetchAllRecords).mockResolvedValueOnce([mockRecord]);
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord2]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/x.md');

    await import('@/index.js');
    await scheduler.runSync?.();

    // The record written during the failed-settings iteration keeps the user's
    // confirmed format (frontmatter off, overwrite) rather than reverting to
    // suffix + frontmatter-on defaults.
    expect(writeMarkdown).toHaveBeenCalledWith(
      mockRecord2,
      'overwrite',
      expect.any(Set),
      false,
    );
  });

  it('keeps autoSync on across a transient failure so the daemon survives one throw', async () => {
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings({ autoSync: true }));
    vi.mocked(fetchAllRecords).mockRejectedValue(new Error('Network error'));

    await import('@/index.js');

    // The throw sets exitCode=1, but autoSync stays reported so the scheduler
    // retries next iteration instead of ending the session on a network blip.
    expect(scheduler.lastSyncResult).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('reports autoSync off when the failure happens before settings are read', async () => {
    const { checkConfig } = await import('@/libs/config.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    // Once-only: clearAllMocks doesn't reset implementations, so a persistent
    // reject would poison later tests.
    vi.mocked(checkConfig).mockRejectedValueOnce(new Error('No config'));

    await import('@/index.js');

    // Failing before the settings read leaves autoSync false, so a run that
    // never got that far won't start a daemon loop.
    expect(scheduler.lastSyncResult).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it('across iterations: announces once and skips records already synced this process', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoSync: true, autoDelete: false }),
    );
    // The same record comes back every iteration (autoDelete off leaves it on
    // the server).
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');

    await import('@/index.js');
    // Drive a second iteration by hand.
    await scheduler.runSync?.();

    // Written once, not twice — the second iteration filtered the already-synced
    // record instead of writing a suffixed duplicate.
    expect(writeMarkdown).toHaveBeenCalledTimes(1);
    expect(mockSpinner.success).toHaveBeenCalledWith('No new records.');
    expect(deleteRecords).not.toHaveBeenCalled();

    const bannerCalls = vi
      .mocked(console.log)
      .mock.calls.filter((call) => String(call[0]).includes('autoSync is on'));
    expect(bannerCalls).toHaveLength(1);
  });

  it('retries a record on the next iteration when its server delete failed', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoSync: true, autoDelete: true }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    // Delete fails on iteration 1 (null), succeeds on iteration 2.
    vi.mocked(deleteRecords)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ deleted: 1 });

    await import('@/index.js');
    // A failed delete must not mark the record synced.
    expect(mockSpinner.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete records'),
    );

    await scheduler.runSync?.();

    // The record was re-written and re-deleted rather than filtered out as
    // "already synced" — a failed delete is retried, not abandoned.
    expect(writeMarkdown).toHaveBeenCalledTimes(2);
    expect(deleteRecords).toHaveBeenCalledTimes(2);
  });

  it('keeps a running daemon alive when a later iteration fails before the settings read', async () => {
    const { checkConfig } = await import('@/libs/config.js');
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings({ autoSync: true }));
    vi.mocked(fetchAllRecords).mockResolvedValue([]);

    await import('@/index.js');
    // Iteration 1 established the daemon (autoSync confirmed on).
    expect(scheduler.lastSyncResult).toBe(true);

    // Iteration 2 fails in checkConfig (before the settings read).
    vi.mocked(checkConfig).mockRejectedValueOnce(new Error('config gone'));
    const secondResult = await scheduler.runSync?.();

    // The daemon resumes from the last confirmed autoSync instead of exiting.
    expect(secondResult).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('resets exitCode to 0 once a failed iteration recovers', async () => {
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(mockSettings({ autoSync: true }));
    vi.mocked(fetchAllRecords)
      .mockRejectedValueOnce(new Error('Network blip'))
      .mockResolvedValue([]);

    await import('@/index.js');
    expect(process.exitCode).toBe(1);

    await scheduler.runSync?.();
    // The recovered iteration cleared the sticky failure code.
    expect(process.exitCode).toBe(0);
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
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
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
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
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
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord, mockRecord2]);
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
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord, mockRecord2]);
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
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
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
