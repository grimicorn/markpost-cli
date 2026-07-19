import chalk from 'chalk';
import { createRecord } from '@/libs/records.js';
import { readMarkdown } from '@/libs/markdown.js';
import { checkConfig } from '@/libs/config.js';

const USAGE = `Usage: markpost push <file>

  file  Path to a markdown file to create a record from`;

export const runPushCommand = async (args: string[]): Promise<void> => {
  try {
    const [filePath] = args;

    if (!filePath) {
      console.log(USAGE);
      return;
    }

    await checkConfig();

    const { title, content } = readMarkdown(filePath);
    const record = await createRecord(title, content);

    if (!record) {
      console.error(chalk.redBright(`Failed to push "${filePath}".`));
      process.exitCode = 1;
      return;
    }

    console.log(chalk.greenBright(`Pushed "${record.title}" (${record.uuid})`));
  } catch (error) {
    console.error(chalk.redBright(error));
    process.exitCode = 1;
  }
};
