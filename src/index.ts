#!/usr/bin/env node

import { fetchAllRecords } from '@/libs/records.js';
import { writeMarkdown } from '@/libs/markdown.js';
import yoctoSpinner from 'yocto-spinner';
import cliSpinners from 'cli-spinners';
import chalk from 'chalk';

const spinner = yoctoSpinner({ spinner: cliSpinners.dots });

try {
  spinner.start('Fetching records...');
  const allRecords = await fetchAllRecords();
  spinner.success(`Fetched ${allRecords.length} records!`);

  spinner.start('Writing records...');
  allRecords.forEach(writeMarkdown);
  spinner.success(`Wrote ${allRecords.length} records!`);
} catch (error) {
  spinner.error();
  console.error(chalk.redBright(error));
}
