import chalk from 'chalk';
import { fetchAllRecords } from '@/libs/records.js';
import { checkConfig } from '@/libs/config.js';
import { failWithUsage } from '@/libs/usage.js';
import { Record } from '@/types/records.types.js';

export const USAGE = `Usage: markpost records <list>

  list  List all pending records without deleting them`;

export const runRecordsCommand = async (args: string[]): Promise<void> => {
  const [subcommand] = args;

  // A missing or unknown subcommand is a usage error (stderr + exit 1), caught
  // before the config check so a scripted caller fails loud instead of exiting
  // 0 on a typo.
  if (subcommand !== 'list') {
    const message = subcommand
      ? `Unknown subcommand: ${subcommand}`
      : 'No subcommand given.';
    failWithUsage(message, USAGE);
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
