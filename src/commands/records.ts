import chalk from 'chalk';
import { fetchAllRecords } from '@/libs/records.js';
import { checkConfig } from '@/libs/config.js';
import { Record } from '@/types/records.types.js';

export const USAGE = `Usage: markpost records <list>

  list  List all pending records without deleting them`;

export const runRecordsCommand = async (args: string[]): Promise<void> => {
  try {
    await checkConfig();

    const [subcommand] = args;

    if (subcommand === 'list') {
      await listRecords();
      return;
    }

    console.log(USAGE);
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
  const result = await fetchAllRecords();

  // A failed fetch must not masquerade as "No records found." — throw so the
  // command's catch reports it loudly and exits non-zero, rather than printing
  // the same message an empty account would produce.
  if (!result.ok) {
    throw new Error('Failed to fetch records from the server.');
  }

  const { records } = result;

  if (records.length === 0) {
    console.log('No records found.');
    return;
  }

  records.forEach(printRecord);
};
