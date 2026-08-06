import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetConfigValue, mockSetConfigValue, mockGetConfigPath } =
  vi.hoisted(() => ({
    mockGetConfigValue: vi.fn(),
    mockSetConfigValue: vi.fn(),
    mockGetConfigPath: vi.fn(),
  }));

vi.mock('@/libs/config.js', () => {
  const CONFIG_KEYS = ['apiToken', 'outputDirectory'] as const;

  return {
    CONFIG_KEYS,
    isConfigKey: (value: string) =>
      (CONFIG_KEYS as readonly string[]).includes(value),
    getConfigValue: mockGetConfigValue,
    setConfigValue: mockSetConfigValue,
    getConfigPath: mockGetConfigPath,
  };
});

vi.mock('chalk', () => ({
  default: {
    redBright: vi.fn((value: unknown) => value),
    greenBright: vi.fn((value: unknown) => value),
    bold: vi.fn((value: unknown) => value),
  },
}));

const LONG_TOKEN = 'sk_abcdef1234567890wxyz';
const SHORT_TOKEN = 'sk_short';
const STORED_DIRECTORY = '/home/user/notes';
const CONFIG_FILE_PATH = '/home/user/.config/@markpost/cli/config.json';

const importCommand = async () => {
  const { runConfigCommand } = await import('@/commands/config.js');
  return runConfigCommand;
};

describe('runConfigCommand', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  const storeAllValues = () => {
    mockGetConfigValue.mockImplementation((key: string) =>
      key === 'apiToken' ? LONG_TOKEN : STORED_DIRECTORY,
    );
  };

  describe('get', () => {
    it('prints every key when no key is given', async () => {
      storeAllValues();
      const runConfigCommand = await importCommand();

      await runConfigCommand(['get']);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('apiToken:'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('outputDirectory:'),
      );
    });

    it('masks the token to its edges and never prints it in full', async () => {
      storeAllValues();
      const runConfigCommand = await importCommand();

      await runConfigCommand(['get', 'apiToken']);

      expect(console.log).toHaveBeenCalledWith('apiToken: sk_a****wxyz');
      const printedInFull = vi
        .mocked(console.log)
        .mock.calls.some(([line]) => String(line).includes(LONG_TOKEN));
      expect(printedInFull).toBe(false);
    });

    it('fully masks a token too short to reveal edges safely', async () => {
      mockGetConfigValue.mockReturnValue(SHORT_TOKEN);
      const runConfigCommand = await importCommand();

      await runConfigCommand(['get', 'apiToken']);

      expect(console.log).toHaveBeenCalledWith('apiToken: ****');
    });

    it('prints the output directory in full (not sensitive)', async () => {
      storeAllValues();
      const runConfigCommand = await importCommand();

      await runConfigCommand(['get', 'outputDirectory']);

      expect(console.log).toHaveBeenCalledWith(
        `outputDirectory: ${STORED_DIRECTORY}`,
      );
    });

    it('shows "(not set)" for an unset value', async () => {
      mockGetConfigValue.mockReturnValue(undefined);
      const runConfigCommand = await importCommand();

      await runConfigCommand(['get', 'apiToken']);

      expect(console.log).toHaveBeenCalledWith('apiToken: (not set)');
    });

    it('errors on an unknown key and does not read it', async () => {
      const runConfigCommand = await importCommand();

      await runConfigCommand(['get', 'bogus']);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Unknown config key: bogus'),
      );
      expect(mockGetConfigValue).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe('set', () => {
    it('stores the value under the given key', async () => {
      const runConfigCommand = await importCommand();

      await runConfigCommand(['set', 'outputDirectory', STORED_DIRECTORY]);

      expect(mockSetConfigValue).toHaveBeenCalledWith(
        'outputDirectory',
        STORED_DIRECTORY,
      );
    });

    it('confirms a token change without echoing the token in full', async () => {
      const runConfigCommand = await importCommand();

      await runConfigCommand(['set', 'apiToken', LONG_TOKEN]);

      expect(mockSetConfigValue).toHaveBeenCalledWith('apiToken', LONG_TOKEN);
      expect(console.log).toHaveBeenCalledWith('Set apiToken to sk_a****wxyz');
      const echoedInFull = vi
        .mocked(console.log)
        .mock.calls.some(([line]) => String(line).includes(LONG_TOKEN));
      expect(echoedInFull).toBe(false);
    });

    it('errors and stores nothing when the value is missing', async () => {
      const runConfigCommand = await importCommand();

      await runConfigCommand(['set', 'apiToken']);

      expect(mockSetConfigValue).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('errors and stores nothing for an unknown key', async () => {
      const runConfigCommand = await importCommand();

      await runConfigCommand(['set', 'bogus', 'value']);

      expect(mockSetConfigValue).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Unknown config key: bogus'),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe('path', () => {
    it('prints the config file location', async () => {
      mockGetConfigPath.mockReturnValue(CONFIG_FILE_PATH);
      const runConfigCommand = await importCommand();

      await runConfigCommand(['path']);

      expect(console.log).toHaveBeenCalledWith(CONFIG_FILE_PATH);
    });
  });

  it('prints usage when no subcommand is given', async () => {
    const runConfigCommand = await importCommand();

    await runConfigCommand([]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Usage: markpost config'),
    );
  });

  it('prints usage for an unrecognized subcommand', async () => {
    const runConfigCommand = await importCommand();

    await runConfigCommand(['bogus']);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Usage: markpost config'),
    );
    expect(mockSetConfigValue).not.toHaveBeenCalled();
  });
});
