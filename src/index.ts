#!/usr/bin/env node

import { deleteRecords, fetchAllRecords } from '@/libs/records.js';
import { writeMarkdown } from '@/libs/markdown.js';
import { runPushCommand } from '@/commands/push.js';
import { runGetCommand } from '@/commands/get.js';
import { runSourcesCommand } from '@/commands/sources.js';
import yoctoSpinner from 'yocto-spinner';
import cliSpinners from 'cli-spinners';
import chalk from 'chalk';
import { checkConfig } from '@/libs/config.js';

const [command, ...commandArgs] = process.argv.slice(2);
const KNOWN_COMMANDS = ['push', 'get', 'sources'];

if (command === 'push') {
  await runPushCommand(commandArgs);
}

if (command === 'get') {
  await runGetCommand(commandArgs);
}

if (command === 'sources') {
  await runSourcesCommand(commandArgs);
}

if (command && !KNOWN_COMMANDS.includes(command)) {
  console.error(chalk.redBright(`Unknown command: ${command}`));
  process.exitCode = 1;
}

// Only run the default fetch/write/delete sync when no subcommand was
// given at all; an unrecognized subcommand must error out above instead
// of silently falling through to a sync that deletes server records.
if (!command) {
  await runDefaultSync();
}

// Default behavior when no subcommand is given: fetch all records, write
// each to a markdown file, then delete them from the server.
async function runDefaultSync(): Promise<void> {
  const spinner = yoctoSpinner({ spinner: cliSpinners.dots });

  try {
    await checkConfig();

    // Fetch records
    spinner.start('Fetching records...');
    const allRecords = await fetchAllRecords();

    if (allRecords.length === 0) {
      spinner.success('No new records, exiting...');
      return;
    }

    spinner.success(`Fetched ${allRecords.length} records!`);

    // Write Records
    spinner.start('Writing records...');
    allRecords.forEach(writeMarkdown);
    spinner.success(`Wrote ${allRecords.length} records!`);

    // Delete Records
    spinner.start('Deleting records...');
    await deleteRecords(allRecords.map(({ uuid }) => uuid));
    spinner.success(`Wrote ${allRecords.length} records!`);
  } catch (error) {
    spinner.error('Something went wrong!');
    console.error(chalk.redBright(error));
    process.exitCode = 1;
  }
}
