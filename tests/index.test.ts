import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Record } from '@/types/records.types.js';
import { UserSettings } from '@/types/settings.types.js';
import { SettingsReadResult } from '@/libs/settings.js';

vi.mock('@/libs/config.js', () => ({ checkConfig: vi.fn() }));
vi.mock('@/libs/records.js', () => ({
  fetchAllRecords: vi.fn(),
  deleteRecords: vi.fn(),
  markRecordSynced: vi.fn(),
}));
vi.mock('@/libs/markdown.js', () => ({ writeMarkdown: vi.fn() }));
vi.mock('@/libs/settings.js', () => ({ fetchSettings: vi.fn() }));
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
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord, mockRecord2]);
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

  it('writes but mutates nothing on the server (no delete, no mark) when settings cannot be read', async () => {
    const { fetchAllRecords, deleteRecords, markRecordSynced } = await import(
      '@/libs/records.js'
    );
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue({ ok: false });
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');

    await import('@/index.js');

    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'suffix', expect.any(Set));
    expect(mockSpinner.success).toHaveBeenCalledWith('Wrote 1 records!');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Could not read settings'),
    );
    // With an unknown autoDelete preference the run must not mutate the server
    // at all: marking synced would be permanent and could strand records a
    // user with autoDelete on wanted deleted. They stay pending for a later
    // run instead.
    expect(mockSpinner.start).not.toHaveBeenCalledWith('Deleting records...');
    expect(deleteRecords).not.toHaveBeenCalled();
    expect(mockSpinner.start).not.toHaveBeenCalledWith(
      'Marking records synced...',
    );
    expect(markRecordSynced).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Settings unreadable'),
    );
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
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(deleteRecords).mockResolvedValue({ deleted: 1 });

    await import('@/index.js');

    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 'suffix', expect.any(Set));
  });

  it('marks records synced (not deleted) when autoDelete is false', async () => {
    const { fetchAllRecords, deleteRecords, markRecordSynced } = await import(
      '@/libs/records.js'
    );
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoDelete: false }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(markRecordSynced).mockResolvedValue(true);

    await import('@/index.js');

    expect(mockSpinner.success).toHaveBeenCalledWith('Wrote 1 records!');
    expect(mockSpinner.start).not.toHaveBeenCalledWith('Deleting records...');
    expect(deleteRecords).not.toHaveBeenCalled();
    // The whole fix for #50: written records must be marked synced so the next
    // pending-only fetch skips them instead of re-writing duplicates.
    expect(mockSpinner.start).toHaveBeenCalledWith('Marking records synced...');
    expect(markRecordSynced).toHaveBeenCalledWith(
      'abc-123',
      '/mock/output/test-title.md',
    );
    expect(mockSpinner.success).toHaveBeenCalledWith('Marked 1 records synced!');
  });

  it('marks every written record synced, not just the first', async () => {
    const mockRecord2: Record = { uuid: 'def-456', title: 'Title 2', content: 'Content 2', createdAt: '2024-01-02T00:00:00Z' };
    const { fetchAllRecords, markRecordSynced } = await import(
      '@/libs/records.js'
    );
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoDelete: false }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord, mockRecord2]);
    vi.mocked(writeMarkdown)
      .mockReturnValueOnce('/mock/output/test-title.md')
      .mockReturnValueOnce('/mock/output/title-2.md');
    vi.mocked(markRecordSynced).mockResolvedValue(true);

    await import('@/index.js');

    expect(markRecordSynced).toHaveBeenCalledTimes(2);
    expect(markRecordSynced).toHaveBeenCalledWith(
      'abc-123',
      '/mock/output/test-title.md',
    );
    expect(markRecordSynced).toHaveBeenCalledWith(
      'def-456',
      '/mock/output/title-2.md',
    );
    expect(mockSpinner.success).toHaveBeenCalledWith('Marked 2 records synced!');
  });

  it('excludes skipped records (null write result) from the mark-synced calls', async () => {
    const mockRecord2: Record = { uuid: 'def-456', title: 'Title 2', content: 'Content 2', createdAt: '2024-01-02T00:00:00Z' };
    const { fetchAllRecords, markRecordSynced } = await import(
      '@/libs/records.js'
    );
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoDelete: false, conflictStrategy: 'skip' }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord, mockRecord2]);
    vi.mocked(writeMarkdown)
      .mockReturnValueOnce('/mock/output/test-title.md')
      .mockReturnValueOnce(null);
    vi.mocked(markRecordSynced).mockResolvedValue(true);

    await import('@/index.js');

    expect(markRecordSynced).toHaveBeenCalledTimes(1);
    expect(markRecordSynced).toHaveBeenCalledWith(
      'abc-123',
      '/mock/output/test-title.md',
    );
  });

  it('does not mark synced when every record was skipped', async () => {
    const mockRecord2: Record = { uuid: 'def-456', title: 'Title 2', content: 'Content 2', createdAt: '2024-01-02T00:00:00Z' };
    const { fetchAllRecords, markRecordSynced } = await import(
      '@/libs/records.js'
    );
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoDelete: false, conflictStrategy: 'skip' }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord, mockRecord2]);
    vi.mocked(writeMarkdown).mockReturnValue(null);

    await import('@/index.js');

    expect(mockSpinner.start).not.toHaveBeenCalledWith(
      'Marking records synced...',
    );
    expect(markRecordSynced).not.toHaveBeenCalled();
  });

  it('reports a mark-synced failure loudly instead of claiming success', async () => {
    const { fetchAllRecords, markRecordSynced } = await import(
      '@/libs/records.js'
    );
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoDelete: false }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(writeMarkdown).mockReturnValue('/mock/output/test-title.md');
    vi.mocked(markRecordSynced).mockResolvedValue(false);

    await import('@/index.js');

    expect(mockSpinner.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to mark 1 record(s) synced'),
    );
    expect(mockSpinner.success).not.toHaveBeenCalledWith(
      expect.stringContaining('Marked'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports only the records whose mark-synced failed, not the whole batch', async () => {
    const mockRecord2: Record = { uuid: 'def-456', title: 'Title 2', content: 'Content 2', createdAt: '2024-01-02T00:00:00Z' };
    const { fetchAllRecords, markRecordSynced } = await import(
      '@/libs/records.js'
    );
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoDelete: false }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord, mockRecord2]);
    vi.mocked(writeMarkdown)
      .mockReturnValueOnce('/mock/output/test-title.md')
      .mockReturnValueOnce('/mock/output/title-2.md');
    // First record succeeds, second fails — the count and the listed path must
    // reflect exactly the one failure, guarding against an off-by-one.
    vi.mocked(markRecordSynced)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await import('@/index.js');

    expect(mockSpinner.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to mark 1 record(s) synced'),
    );
    expect(mockSpinner.success).not.toHaveBeenCalledWith(
      expect.stringContaining('Marked'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('/mock/output/title-2.md'),
    );
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining('! abc-123'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('marks records across multiple concurrency batches and pinpoints a failure in a later batch', async () => {
    const records: Record[] = Array.from({ length: 11 }, (_item, index) => ({
      uuid: `uuid-${index}`,
      title: `Title ${index}`,
      content: `Content ${index}`,
      createdAt: '2024-01-01T00:00:00Z',
    }));
    const { fetchAllRecords, markRecordSynced } = await import(
      '@/libs/records.js'
    );
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { fetchSettings } = await import('@/libs/settings.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchSettings).mockResolvedValue(
      mockSettings({ autoDelete: false }),
    );
    vi.mocked(fetchAllRecords).mockResolvedValue(records);
    vi.mocked(writeMarkdown).mockImplementation(
      (record: Record) => `/mock/output/${record.uuid}.md`,
    );
    // Only the 11th record (in the second batch, since concurrency is 10)
    // fails, exercising the slice/order arithmetic across batches.
    vi.mocked(markRecordSynced).mockImplementation((uuid: string) =>
      Promise.resolve(uuid !== 'uuid-10'),
    );

    await import('@/index.js');

    expect(markRecordSynced).toHaveBeenCalledTimes(11);
    expect(mockSpinner.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to mark 1 record(s) synced'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('! uuid-10 -> /mock/output/uuid-10.md'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Marked 10 record(s) synced despite'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('deletes records (never marks synced) when autoDelete is true', async () => {
    const { fetchAllRecords, deleteRecords, markRecordSynced } = await import(
      '@/libs/records.js'
    );
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
    // The delete path must not also PATCH records that are about to be removed.
    expect(markRecordSynced).not.toHaveBeenCalled();
    expect(mockSpinner.start).not.toHaveBeenCalledWith(
      'Marking records synced...',
    );
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
