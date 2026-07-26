import Conf from 'conf';
import packageJson from './../../package.json' with { type: 'json' };
import { input } from '@inquirer/prompts';
import chalk from 'chalk';

const schema = {
  apiToken: {
    type: 'string',
  },
  outputDirectory: {
    type: 'string',
  },
};

export const config = new Conf({
  projectName: packageJson.name,
  schema,
});

const checkApiToken = async () => {
  if (config.get('apiToken')) {
    return;
  }

  if (process.env.API_TOKEN) {
    config.set('apiToken', process.env.API_TOKEN);
    return;
  }

  const apiToken = await input({ message: 'Sync API Token' });

  if (!apiToken) {
    console.error(chalk.redBright('Sync API Token is required!'));
    process.exit();
  }

  config.set('apiToken', apiToken);
};

const checkOutputDirectory = async () => {
  if (config.get('outputDirectory')) {
    return;
  }

  if (process.env.OUTPUT_DIRECTORY) {
    config.set('outputDirectory', process.env.OUTPUT_DIRECTORY);
    return;
  }

  const outputDirectory = await input({ message: 'Output Directory' });

  if (!outputDirectory) {
    console.error(chalk.redBright('Output Directory is required!'));
    process.exit();
  }

  config.set('outputDirectory', outputDirectory);
};

export const checkConfig = async () => {
  await checkApiToken();
  await checkOutputDirectory();
};
