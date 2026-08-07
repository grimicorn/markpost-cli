import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Record } from '@/types/records.types.js';

vi.mock('@/libs/config.js', () => ({ checkConfig: vi.fn() }));
vi.mock('@/libs/records.js', () => ({
  fetchAllRecords: vi.fn(),
  deleteRecords: vi.fn(),
}));
vi.mock('chalk', () => ({
  default: {
    redBright: vi.fn((value: unknown) => value),
    bold: vi.fn((value: unknown) => value),
  },
}));

const firstRecord: Record = {
  uuid: 'abc-123',
  createdAt: '2024-01-01T00:00:00Z',
  title: 'First Record',
  content: 'First record content',
};

const secondRecord: Record = {
  uuid: 'def-456',
  createdAt: '2024-01-02T00:00:00Z',
  title: 'Second Record',
  content: 'Second record content',
};

describe('runRecordsCommand', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  it('always checks config before dispatching', async () => {
    const { checkConfig } = await import('@/libs/config.js');
    const { fetchAllRecords } = await import('@/libs/records.js');
    vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [] });
    const { runRecordsCommand } = await import('@/commands/records.js');

    await runRecordsCommand(['list']);

    expect(checkConfig).toHaveBeenCalled();
  });

  it('never dispatches to list when checkConfig fails', async () => {
    const { checkConfig } = await import('@/libs/config.js');
    const { fetchAllRecords } = await import('@/libs/records.js');
    vi.mocked(checkConfig).mockRejectedValue(new Error('Missing API key'));
    const { runRecordsCommand } = await import('@/commands/records.js');

    await runRecordsCommand(['list']);

    expect(fetchAllRecords).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('prints usage when no subcommand is given', async () => {
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { runRecordsCommand } = await import('@/commands/records.js');

    await runRecordsCommand([]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Usage: markpost records'),
    );
    expect(fetchAllRecords).not.toHaveBeenCalled();
  });

  it('prints usage for an unrecognized subcommand', async () => {
    const { fetchAllRecords } = await import('@/libs/records.js');
    const { runRecordsCommand } = await import('@/commands/records.js');

    await runRecordsCommand(['bogus']);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Usage: markpost records'),
    );
    expect(fetchAllRecords).not.toHaveBeenCalled();
  });

  describe('list', () => {
    it('prints "No records found." when there are none', async () => {
      const { fetchAllRecords } = await import('@/libs/records.js');
      vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [] });
      const { runRecordsCommand } = await import('@/commands/records.js');

      await runRecordsCommand(['list']);

      expect(console.log).toHaveBeenCalledWith('No records found.');
    });

    it('prints each fetched record', async () => {
      const { fetchAllRecords } = await import('@/libs/records.js');
      vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [firstRecord, secondRecord] });
      const { runRecordsCommand } = await import('@/commands/records.js');

      await runRecordsCommand(['list']);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('First Record'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('abc-123'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Second Record'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('def-456'),
      );
    });

    it('never deletes the records it lists', async () => {
      const { fetchAllRecords, deleteRecords } = await import(
        '@/libs/records.js'
      );
      vi.mocked(fetchAllRecords).mockResolvedValue({ ok: true, records: [firstRecord, secondRecord] });
      const { runRecordsCommand } = await import('@/commands/records.js');

      await runRecordsCommand(['list']);

      expect(deleteRecords).not.toHaveBeenCalled();
    });

    // A failed fetch (`ok: false`) must not print "No records found." — it has
    // to surface loudly and exit non-zero, distinct from an empty account.
    it('fails loud and exits non-zero when the fetch fails', async () => {
      const { fetchAllRecords } = await import('@/libs/records.js');
      vi.mocked(fetchAllRecords).mockResolvedValue({ ok: false });
      const { runRecordsCommand } = await import('@/commands/records.js');

      await runRecordsCommand(['list']);

      expect(console.log).not.toHaveBeenCalledWith('No records found.');
      expect(console.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  it('surfaces a fetch error instead of throwing', async () => {
    const { fetchAllRecords, deleteRecords } = await import(
      '@/libs/records.js'
    );
    vi.mocked(fetchAllRecords).mockRejectedValue(new Error('Network error'));
    const { runRecordsCommand } = await import('@/commands/records.js');

    await runRecordsCommand(['list']);

    expect(console.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Network error' }),
    );
    expect(deleteRecords).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
