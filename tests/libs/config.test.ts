import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { input } from '@inquirer/prompts';
import { checkConfig } from '@/libs/config.js';

const { mockGet, mockSet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
}));

vi.mock('conf', () => ({
  default: vi.fn().mockImplementation(function () {
    return { get: mockGet, set: mockSet };
  }),
}));

vi.mock('@inquirer/prompts', () => ({ input: vi.fn() }));

describe('checkConfig', () => {
  const originalApiToken = process.env.API_TOKEN;
  const originalOutputDirectory = process.env.OUTPUT_DIRECTORY;

  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.API_TOKEN;
    delete process.env.OUTPUT_DIRECTORY;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.API_TOKEN = originalApiToken;
    process.env.OUTPUT_DIRECTORY = originalOutputDirectory;
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    mockGet.mockReset();
    mockSet.mockReset();
    vi.mocked(input).mockReset();
  });

  it('returns without prompting when both configs are stored', async () => {
    mockGet.mockReturnValue('stored-value');
    await checkConfig();
    expect(input).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  describe('apiToken', () => {
    beforeEach(() => {
      mockGet.mockImplementation((key: string) =>
        key === 'outputDirectory' ? '/stored/dir' : undefined,
      );
    });

    it('sets token from API_TOKEN env var and returns', async () => {
      process.env.API_TOKEN = 'env-token';
      await checkConfig();
      expect(mockSet).toHaveBeenCalledWith('apiToken', 'env-token');
      expect(input).not.toHaveBeenCalled();
    });

    it('prompts and sets token when not in env or config', async () => {
      vi.mocked(input).mockResolvedValue('my-token');
      await checkConfig();
      expect(mockSet).toHaveBeenCalledWith('apiToken', 'my-token');
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('logs error and exits when token prompt is empty', async () => {
      vi.mocked(input).mockResolvedValue('');
      await checkConfig();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Sync API Token is required!'));
      expect(exitSpy).toHaveBeenCalled();
    });
  });

  describe('outputDirectory', () => {
    beforeEach(() => {
      mockGet.mockImplementation((key: string) =>
        key === 'apiToken' ? 'stored-token' : undefined,
      );
    });

    it('sets directory from OUTPUT_DIRECTORY env var and returns', async () => {
      process.env.OUTPUT_DIRECTORY = '/env/dir';
      await checkConfig();
      expect(mockSet).toHaveBeenCalledWith('outputDirectory', '/env/dir');
      expect(input).not.toHaveBeenCalled();
    });

    it('prompts and sets directory when not in env or config', async () => {
      vi.mocked(input).mockResolvedValue('/my/dir');
      await checkConfig();
      expect(mockSet).toHaveBeenCalledWith('outputDirectory', '/my/dir');
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('logs error and exits when directory prompt is empty', async () => {
      vi.mocked(input).mockResolvedValue('');
      await checkConfig();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Output Directory is required!'));
      expect(exitSpy).toHaveBeenCalled();
    });
  });
});
