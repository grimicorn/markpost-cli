import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Record } from '@/types/records.types.js';

vi.mock('@/libs/config.js', () => ({ checkConfig: vi.fn() }));
vi.mock('@/libs/records.js', () => ({ fetchAllRecords: vi.fn(), deleteRecords: vi.fn() }));
vi.mock('@/libs/markdown.js', () => ({ writeMarkdown: vi.fn() }));
vi.mock('@/commands/push.js', () => ({ runPushCommand: vi.fn() }));
vi.mock('@/commands/get.js', () => ({ runGetCommand: vi.fn() }));
vi.mock('@/commands/sources.js', () => ({ runSourcesCommand: vi.fn() }));
vi.mock('yocto-spinner', () => ({ default: vi.fn() }));
vi.mock('cli-spinners', () => ({ default: { dots: {} } }));
vi.mock('chalk', () => ({ default: { redBright: vi.fn((s: unknown) => s) } }));

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
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    await import('@/index.js');

    expect(runPushCommand).not.toHaveBeenCalled();
    expect(runGetCommand).not.toHaveBeenCalled();
    expect(runSourcesCommand).not.toHaveBeenCalled();
    expect(fetchAllRecords).not.toHaveBeenCalled();
    expect(deleteRecords).not.toHaveBeenCalled();
    expect(yoctoSpinner).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown command: puhs'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('fetches all records and writes each as markdown', async () => {
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);
    vi.mocked(deleteRecords).mockResolvedValue(undefined);

    await import('@/index.js');

    expect(mockSpinner.start).toHaveBeenCalledWith('Fetching records...');
    expect(fetchAllRecords).toHaveBeenCalled();
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 0, [mockRecord]);
    expect(mockSpinner.success).toHaveBeenCalledWith('Fetched 1 records!');
    expect(mockSpinner.start).toHaveBeenCalledWith('Writing records...');
    expect(mockSpinner.success).toHaveBeenCalledWith('Wrote 1 records!');
    expect(mockSpinner.start).toHaveBeenCalledWith('Deleting records...');
    expect(deleteRecords).toHaveBeenCalledWith(['abc-123']);
  });

  it('writes one markdown file per record', async () => {
    const mockRecord2: Record = { uuid: 'def-456', title: 'Title 2', content: 'Content 2', createdAt: '2024-01-02T00:00:00Z' };
    const { fetchAllRecords, deleteRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord, mockRecord2]);
    vi.mocked(deleteRecords).mockResolvedValue(undefined);

    await import('@/index.js');

    const records = [mockRecord, mockRecord2];
    expect(writeMarkdown).toHaveBeenCalledTimes(2);
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 0, records);
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord2, 1, records);
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
});
