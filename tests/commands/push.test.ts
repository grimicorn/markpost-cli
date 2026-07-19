import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Record } from '@/types/records.types.js';

vi.mock('@/libs/config.js', () => ({ checkConfig: vi.fn() }));
vi.mock('@/libs/records.js', () => ({ createRecord: vi.fn() }));
vi.mock('@/libs/markdown.js', () => ({ readMarkdown: vi.fn() }));
vi.mock('chalk', () => ({
  default: {
    redBright: vi.fn((value: unknown) => value),
    greenBright: vi.fn((value: unknown) => value),
  },
}));

const mockRecord: Record = {
  uuid: 'abc-123',
  title: 'Test Title',
  content: 'Test Content',
  createdAt: '2024-01-01T00:00:00Z',
};

describe('runPushCommand', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('prints usage when no file path is given', async () => {
    const { runPushCommand } = await import('@/commands/push.js');

    await runPushCommand([]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Usage: markpost push'),
    );
  });

  it('does not check config when no file path is given', async () => {
    const { checkConfig } = await import('@/libs/config.js');
    const { runPushCommand } = await import('@/commands/push.js');

    await runPushCommand([]);

    expect(checkConfig).not.toHaveBeenCalled();
  });

  it('reads the markdown file and creates a record from it', async () => {
    const { checkConfig } = await import('@/libs/config.js');
    const { createRecord } = await import('@/libs/records.js');
    const { readMarkdown } = await import('@/libs/markdown.js');
    vi.mocked(readMarkdown).mockReturnValue({
      title: 'Test Title',
      content: 'Test Content',
    });
    vi.mocked(createRecord).mockResolvedValue(mockRecord);
    const { runPushCommand } = await import('@/commands/push.js');

    await runPushCommand(['./notes/test-title.md']);

    expect(checkConfig).toHaveBeenCalled();
    expect(readMarkdown).toHaveBeenCalledWith('./notes/test-title.md');
    expect(createRecord).toHaveBeenCalledWith('Test Title', 'Test Content');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Pushed "Test Title" (abc-123)'),
    );
  });

  it('reports an error when createRecord fails', async () => {
    const { createRecord } = await import('@/libs/records.js');
    const { readMarkdown } = await import('@/libs/markdown.js');
    vi.mocked(readMarkdown).mockReturnValue({
      title: 'Test Title',
      content: 'Test Content',
    });
    vi.mocked(createRecord).mockResolvedValue(null);
    const { runPushCommand } = await import('@/commands/push.js');

    await runPushCommand(['./notes/test-title.md']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to push "./notes/test-title.md".'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('catches and logs an error when reading the file throws', async () => {
    const { readMarkdown } = await import('@/libs/markdown.js');
    vi.mocked(readMarkdown).mockImplementation(() => {
      throw Error('File not found: ./missing.md');
    });
    const { runPushCommand } = await import('@/commands/push.js');

    await runPushCommand(['./missing.md']);

    expect(console.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
