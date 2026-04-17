#!/usr/bin/env node

import { deleteRecords, fetchAllRecords } from '@/libs/records.js';
import { writeMarkdown } from '@/libs/markdown.js';
import yoctoSpinner from 'yocto-spinner';
import cliSpinners from 'cli-spinners';
import chalk from 'chalk';

const spinner = yoctoSpinner({ spinner: cliSpinners.dots });

try {
  spinner.start('Fetching records...');
  const allRecords = await fetchAllRecords();

  if (allRecords.length === 0) {
    spinner.success('No new records, exiting...');
    process.exit();
  }

  spinner.success(`Fetched ${allRecords.length} records!`);

  spinner.start('Writing records...');
  allRecords.forEach(writeMarkdown);
  spinner.success(`Wrote ${allRecords.length} records!`);

  spinner.start('Deleting records...');
  await deleteRecords(allRecords.map(({ uuid }) => uuid));
  spinner.success(`Wrote ${allRecords.length} records!`);
} catch (error) {
  spinner.error();
  console.error(chalk.redBright(error));
}
