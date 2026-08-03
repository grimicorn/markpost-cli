import { parseArgs } from 'node:util';
import chalk from 'chalk';
import { fetchAllRecords, RecordListFilters } from '@/libs/records.js';
import { checkConfig } from '@/libs/config.js';
import { Record } from '@/types/records.types.js';

const USAGE = `Usage: markpost records list [options]

  list  List records, optionally filtered by source, status, or search text

Options:
  --source <type>    Filter by source type (markpost reports the valid types if the value is rejected)
  --status <status>  Filter by record status (synced, pending, or error)
  --search <text>    Filter by text in the title or content`;

export const runRecordsCommand = async (args: string[]): Promise<void> => {
  try {
    await checkConfig();

    const [subcommand] = args;

    if (subcommand === 'list') {
      await listRecords(parseListFilters(args));
      return;
    }

    console.log(USAGE);
  } catch (error) {
    console.error(chalk.redBright(error));
    process.exitCode = 1;
  }
};

// `parseArgs` handles both `--source webhook` and `--source=webhook`, and
// throws on an unknown flag or a missing value, which the command's outer
// catch surfaces to the user. The `list` subcommand itself lands in
// `positionals` and is skipped here.
const parseListFilters = (args: string[]): RecordListFilters => {
  // `multiple: true` collects repeats into an array so a flag passed twice
  // (`--source webhook --source email`) can be rejected rather than silently
  // last-winning, matching how stray positionals and empty values fail below.
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      source: { type: 'string', multiple: true },
      status: { type: 'string', multiple: true },
      search: { type: 'string', multiple: true },
    },
  });

  // positionals[0] is the `list` subcommand itself; anything past it is a
  // stray argument (e.g. `records list webhook`, a likely miss for
  // `--source webhook`) and must fail loudly rather than silently listing
  // everything unfiltered.
  if (positionals.length > 1) {
    throw new Error(
      `Unexpected argument "${positionals[1]}". Set filters with --source, --status, or --search.`,
    );
  }

  return {
    source: normalizeFilter('source', values.source),
    status: normalizeFilter('status', values.status),
    search: normalizeFilter('search', values.search),
  };
};

// Collapses a flag's parsed occurrences (an array under `multiple: true`)
// into a single validated value. A flag passed more than once is ambiguous
// and rejected. A present-but-empty or whitespace-only flag (`--source=`,
// `--search ' '`) would otherwise drop out of the query and list everything
// while the user believes they filtered, so it is rejected too. The trimmed
// value is what gets sent: markpost trims `filter[q]` server-side anyway, and
// a trimmed source/status is more forgiving than shipping surrounding spaces
// that match nothing.
const normalizeFilter = (
  flag: string,
  occurrences: string[] | undefined,
): string | undefined => {
  if (occurrences === undefined) {
    return undefined;
  }

  if (occurrences.length > 1) {
    throw new Error(`--${flag} was given more than once. Pass it only once.`);
  }

  const trimmed = occurrences[0].trim();

  if (trimmed.length === 0) {
    throw new Error(`--${flag} needs a non-empty value.`);
  }

  return trimmed;
};

const printRecord = (record: Record): void => {
  console.log(chalk.bold(record.title));
  console.log(`  uuid:       ${record.uuid}`);
  console.log(`  created at: ${record.createdAt}`);
};

// Read-only preview of what the default sync would fetch. Deliberately
// never touches deleteRecords: this is the safe alternative to running the
// no-arg sync just to see what's pending.
const listRecords = async (filters: RecordListFilters): Promise<void> => {
  const records = await fetchAllRecords(filters);

  if (records.length === 0) {
    console.log('No records found.');
    return;
  }

  records.forEach(printRecord);
};
