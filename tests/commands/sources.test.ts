import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Source } from '@/types/sources.types.js';

vi.mock('@/libs/config.js', () => ({ checkConfig: vi.fn() }));
vi.mock('@/libs/sources.js', () => ({
  fetchSources: vi.fn(),
  createSource: vi.fn(),
  deleteSource: vi.fn(),
}));
vi.mock('@inquirer/prompts', () => ({ input: vi.fn(), select: vi.fn() }));
vi.mock('chalk', () => ({
  default: {
    redBright: vi.fn((value: unknown) => value),
    greenBright: vi.fn((value: unknown) => value),
    bold: vi.fn((value: unknown) => value),
  },
}));

const webhookSource: Source = {
  uuid: 'abc-123',
  createdAt: '2024-01-01T00:00:00Z',
  type: 'webhook',
  name: 'Webhook Source',
  provider: null,
  endpointSlug: 'wh_abc12345',
  routeFolder: '99-incoming/',
  lastHitAt: null,
  recordCount: 3,
};

const emailSource: Source = {
  uuid: 'def-456',
  createdAt: '2024-01-02T00:00:00Z',
  type: 'email',
  name: 'Email Source',
  provider: null,
  endpointSlug: 'clip-ab12',
  routeFolder: '98-incoming/',
  lastHitAt: '2024-02-01T00:00:00Z',
  recordCount: 1,
};

describe('buildEndpointUrl', () => {
  it('builds a webhook ingest URL for non-email source types', async () => {
    const { buildEndpointUrl } = await import('@/commands/sources.js');
    expect(buildEndpointUrl('webhook', 'wh_abc12345')).toBe(
      'https://ingest.markpost.io/v1/hooks/wh_abc12345',
    );
  });

  it('builds an email-in address for email source types', async () => {
    const { buildEndpointUrl } = await import('@/commands/sources.js');
    expect(buildEndpointUrl('email', 'clip-ab12')).toBe('clip-ab12@in.markpost.io');
  });
});

describe('runSourcesCommand', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('always checks config before dispatching', async () => {
    const { checkConfig } = await import('@/libs/config.js');
    const { fetchSources } = await import('@/libs/sources.js');
    vi.mocked(fetchSources).mockResolvedValue([]);
    const { runSourcesCommand } = await import('@/commands/sources.js');

    await runSourcesCommand(['list']);

    expect(checkConfig).toHaveBeenCalled();
  });

  it('prints usage for an unrecognized or missing subcommand', async () => {
    const { runSourcesCommand } = await import('@/commands/sources.js');

    await runSourcesCommand([]);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Usage: markpost sources'));
  });

  describe('list', () => {
    it('prints "No sources found." when there are none', async () => {
      const { fetchSources } = await import('@/libs/sources.js');
      vi.mocked(fetchSources).mockResolvedValue([]);
      const { runSourcesCommand } = await import('@/commands/sources.js');

      await runSourcesCommand(['list']);

      expect(console.log).toHaveBeenCalledWith('No sources found.');
    });

    it('prints each source, including its computed endpoint URL', async () => {
      const { fetchSources } = await import('@/libs/sources.js');
      vi.mocked(fetchSources).mockResolvedValue([webhookSource, emailSource]);
      const { runSourcesCommand } = await import('@/commands/sources.js');

      await runSourcesCommand(['list']);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('https://ingest.markpost.io/v1/hooks/wh_abc12345'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('clip-ab12@in.markpost.io'),
      );
    });
  });

  describe('create', () => {
    it('prompts for source details and creates the source', async () => {
      const { input, select } = await import('@inquirer/prompts');
      const { createSource } = await import('@/libs/sources.js');
      vi.mocked(select).mockResolvedValue('webhook');
      vi.mocked(input)
        .mockResolvedValueOnce('Webhook Source')
        .mockResolvedValueOnce('99-incoming/')
        .mockResolvedValueOnce('');
      vi.mocked(createSource).mockResolvedValue(webhookSource);
      const { runSourcesCommand } = await import('@/commands/sources.js');

      await runSourcesCommand(['create']);

      expect(createSource).toHaveBeenCalledWith({
        type: 'webhook',
        name: 'Webhook Source',
        routeFolder: '99-incoming/',
        provider: undefined,
      });
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Created source "Webhook Source"'),
      );
    });

    it('reports an error when creation fails', async () => {
      const { input, select } = await import('@inquirer/prompts');
      const { createSource } = await import('@/libs/sources.js');
      vi.mocked(select).mockResolvedValue('webhook');
      vi.mocked(input)
        .mockResolvedValueOnce('Webhook Source')
        .mockResolvedValueOnce('99-incoming/')
        .mockResolvedValueOnce('');
      vi.mocked(createSource).mockResolvedValue(null);
      const { runSourcesCommand } = await import('@/commands/sources.js');

      await runSourcesCommand(['create']);

      expect(console.error).toHaveBeenCalledWith('Failed to create source.');
    });
  });

  describe('delete', () => {
    it('deletes directly by uuid when one is provided', async () => {
      const { deleteSource } = await import('@/libs/sources.js');
      vi.mocked(deleteSource).mockResolvedValue({ deleted: 1 });
      const { select } = await import('@inquirer/prompts');
      const { runSourcesCommand } = await import('@/commands/sources.js');

      await runSourcesCommand(['delete', 'abc-123']);

      expect(deleteSource).toHaveBeenCalledWith('abc-123');
      expect(select).not.toHaveBeenCalled();
    });

    it('prompts to pick a source when no uuid is given', async () => {
      const { fetchSources, deleteSource } = await import('@/libs/sources.js');
      vi.mocked(fetchSources).mockResolvedValue([webhookSource]);
      vi.mocked(deleteSource).mockResolvedValue({ deleted: 1 });
      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValue('abc-123');
      const { runSourcesCommand } = await import('@/commands/sources.js');

      await runSourcesCommand(['delete']);

      expect(deleteSource).toHaveBeenCalledWith('abc-123');
    });

    it('does nothing when there are no sources to pick from', async () => {
      const { fetchSources, deleteSource } = await import('@/libs/sources.js');
      vi.mocked(fetchSources).mockResolvedValue([]);
      const { runSourcesCommand } = await import('@/commands/sources.js');

      await runSourcesCommand(['delete']);

      expect(deleteSource).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('No sources to delete.');
    });

    it('reports an error when deletion fails', async () => {
      const { deleteSource } = await import('@/libs/sources.js');
      vi.mocked(deleteSource).mockResolvedValue(null);
      const { runSourcesCommand } = await import('@/commands/sources.js');

      await runSourcesCommand(['delete', 'abc-123']);

      expect(console.error).toHaveBeenCalledWith('Failed to delete source.');
    });
  });

  it('catches and logs unexpected errors (e.g. checkConfig failing)', async () => {
    const { checkConfig } = await import('@/libs/config.js');
    vi.mocked(checkConfig).mockRejectedValue(new Error('boom'));
    const { runSourcesCommand } = await import('@/commands/sources.js');

    await runSourcesCommand(['list']);

    expect(console.error).toHaveBeenCalled();
  });
});
