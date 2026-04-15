import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Record } from '@/types/records.types.js';

vi.mock('@/libs/records.js', () => ({ fetchAllRecords: vi.fn() }));
vi.mock('@/libs/markdown.js', () => ({ writeMarkdown: vi.fn() }));
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

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockSpinner = { start: vi.fn(), success: vi.fn(), error: vi.fn() };
  });

  it('fetches all records and writes each as markdown', async () => {
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord]);

    await import('@/index.js');

    expect(mockSpinner.start).toHaveBeenCalledWith('Fetching records...');
    expect(fetchAllRecords).toHaveBeenCalled();
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 0, [mockRecord]);
    expect(mockSpinner.success).toHaveBeenCalledWith('Fetched 1 records!');
    expect(mockSpinner.success).toHaveBeenCalledWith('Wrote 1 records!');
  });

  it('writes one markdown file per record', async () => {
    const mockRecord2: Record = { uuid: 'def-456', title: 'Title 2', content: 'Content 2', createdAt: '2024-01-02T00:00:00Z' };
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { writeMarkdown } = await import('@/libs/markdown.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchAllRecords).mockResolvedValue([mockRecord, mockRecord2]);

    await import('@/index.js');

    const records = [mockRecord, mockRecord2];
    expect(writeMarkdown).toHaveBeenCalledTimes(2);
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord, 0, records);
    expect(writeMarkdown).toHaveBeenCalledWith(mockRecord2, 1, records);
  });

  it('calls spinner.error and logs to console.error when fetchAllRecords throws', async () => {
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { default: yoctoSpinner } = await import('yocto-spinner');

    vi.mocked(yoctoSpinner).mockReturnValue(mockSpinner);
    vi.mocked(fetchAllRecords).mockRejectedValue(new Error('Network error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('@/index.js');

    expect(mockSpinner.error).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
