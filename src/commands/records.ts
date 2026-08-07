import chalk from 'chalk';
import { fetchAllRecords } from '@/libs/records.js';
import { checkConfig } from '@/libs/config.js';
import { failWithSubcommandUsage } from '@/libs/usage.js';
import { Record } from '@/types/records.types.js';

export const USAGE = `Usage: markpost records <list>

  list  List all pending records without deleting them`;

export const runRecordsCommand = async (args: string[]): Promise<void> => {
  const [subcommand] = args;

  // Validate before the config check so a bad subcommand fails on usage alone,
  // without needing a configured account.
  if (subcommand !== 'list') {
    failWithSubcommandUsage(subcommand, USAGE);
    return;
  }

  try {
    await checkConfig();
    await listRecords();
  } catch (error) {
    console.error(chalk.redBright(error));
    process.exitCode = 1;
  }
};

const printRecord = (record: Record): void => {
  console.log(chalk.bold(record.title));
  console.log(`  uuid:       ${record.uuid}`);
  console.log(`  created at: ${record.createdAt}`);
};

// Read-only preview of what the default sync would fetch. Deliberately
// never touches deleteRecords: this is the safe alternative to running the
// no-arg sync just to see what's pending.
const listRecords = async (): Promise<void> => {
  const records = await fetchAllRecords();

  if (records.length === 0) {
    console.log('No records found.');
    return;
  }

  records.forEach(printRecord);
};
