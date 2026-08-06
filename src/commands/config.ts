import chalk from 'chalk';
import {
  CONFIG_KEYS,
  ConfigKey,
  getConfigPath,
  getConfigValue,
  isConfigKey,
  setConfigValue,
} from '@/libs/config.js';

const USAGE = `Usage: markpost config <get|set|path> [key] [value]

  get [key]      Show all stored config, or just <key> if given
  set <key> <value>  Store <value> under <key>
  path           Print the location of the config file

  keys: ${CONFIG_KEYS.join(', ')}`;

// apiToken is a secret, so it's never printed in full. outputDirectory is a
// plain path and shown as-is.
const SENSITIVE_KEYS = new Set<ConfigKey>(['apiToken']);

const NOT_SET_LABEL = '(not set)';

// A fixed-width middle mask keeps the redacted token from leaking its real
// length, while the visible edges still let a user confirm which token is
// stored.
const VISIBLE_EDGE_LENGTH = 4;
const MASK_SEGMENT = '****';

// Nothing shorter than both edges combined can reveal edges without exposing
// most of the secret, so such tokens are fully masked.
const MIN_LENGTH_TO_REVEAL_EDGES = VISIBLE_EDGE_LENGTH * 2;

const maskToken = (token: string): string => {
  if (token.length <= MIN_LENGTH_TO_REVEAL_EDGES) {
    return MASK_SEGMENT;
  }

  const prefix = token.slice(0, VISIBLE_EDGE_LENGTH);
  const suffix = token.slice(-VISIBLE_EDGE_LENGTH);

  return `${prefix}${MASK_SEGMENT}${suffix}`;
};

const formatValue = (key: ConfigKey, value: string | undefined): string => {
  if (value === undefined) {
    return NOT_SET_LABEL;
  }

  if (SENSITIVE_KEYS.has(key)) {
    return maskToken(value);
  }

  return value;
};

const printKey = (key: ConfigKey): void => {
  console.log(`${key}: ${formatValue(key, getConfigValue(key))}`);
};

const getConfig = (key?: string): void => {
  if (!key) {
    CONFIG_KEYS.forEach(printKey);
    return;
  }

  if (!isConfigKey(key)) {
    console.error(chalk.redBright(`Unknown config key: ${key}`));
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  printKey(key);
};

const setConfig = (key?: string, value?: string): void => {
  if (!key || value === undefined) {
    console.error(chalk.redBright('Both a key and a value are required.'));
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  if (!isConfigKey(key)) {
    console.error(chalk.redBright(`Unknown config key: ${key}`));
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  setConfigValue(key, value);
  console.log(chalk.greenBright(`Set ${key} to ${formatValue(key, value)}`));
};

const printPath = (): void => {
  console.log(getConfigPath());
};

export const runConfigCommand = async (args: string[]): Promise<void> => {
  const [subcommand, key, value] = args;

  if (subcommand === 'get') {
    getConfig(key);
    return;
  }

  if (subcommand === 'set') {
    setConfig(key, value);
    return;
  }

  if (subcommand === 'path') {
    printPath();
    return;
  }

  console.log(USAGE);
};
