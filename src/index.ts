#!/usr/bin/env node

import {
  deleteRecords,
  fetchAllRecords,
  markRecordSynced,
} from '@/libs/records.js';
import { writeMarkdown } from '@/libs/markdown.js';
import { fetchSettings } from '@/libs/settings.js';
import { runPushCommand, USAGE as PUSH_USAGE } from '@/commands/push.js';
import { runGetCommand, USAGE as GET_USAGE } from '@/commands/get.js';
import {
  runSourcesCommand,
  USAGE as SOURCES_USAGE,
} from '@/commands/sources.js';
import {
  runRecordsCommand,
  USAGE as RECORDS_USAGE,
} from '@/commands/records.js';
import yoctoSpinner from 'yocto-spinner';
import cliSpinners from 'cli-spinners';
import chalk from 'chalk';
import { checkConfig } from '@/libs/config.js';
import { Record } from '@/types/records.types.js';
import {
  ConflictStrategy,
  normalizeAutoDelete,
  normalizeConflictStrategy,
} from '@/types/settings.types.js';

type Spinner = ReturnType<typeof yoctoSpinner>;

// Cap how many mark-synced PATCHes are in flight at once. A large first sync
// can write hundreds of records; firing one unbounded `Promise.all` over all
// of them risks rate-limit/connection failures exactly when the batch is
// biggest — and every failed mark stays pending and re-duplicates next run.
// Declared here (above the top-level `dispatch()` call) so the hoisted helpers
// don't hit its temporal dead zone when the default sync runs.
const MARK_SYNCED_CONCURRENCY = 10;

const [commandName, ...commandArgs] = process.argv.slice(2);

const SYNC_COMMAND = 'sync';

// The fetch/write/delete sync is destructive (it can delete server records),
// so it must be requested explicitly by name — never triggered by a bare,
// accidental `markpost`. Its usage lives here because the sync lives here.
const SYNC_USAGE = `Usage: markpost sync

  Fetch all pending records, write each to a markdown file, and (when
  autoDelete is enabled) delete the written records from the server`;

// Tokens in the command position that print top-level help instead of running
// a command. `help` is only a command word — as a sub-argument it could be a
// real path, so per-command help below accepts flags only.
const HELP_COMMANDS = new Set(['help', '--help', '-h']);
const HELP_FLAG_ARGS = new Set(['--help', '-h']);

interface Command {
  run: (args: string[]) => Promise<void>;
  usage: string;
}

// Single source of truth for dispatch, per-command help, and the aggregated
// top-level help: adding a command here wires up all three. A Map (rather than
// a plain object) means a command named "toString" or "constructor" can't
// resolve to an inherited Object.prototype member instead of falling through
// to the "unknown command" branch.
const COMMANDS = new Map<string, Command>([
  [SYNC_COMMAND, { run: runSyncCommand, usage: SYNC_USAGE }],
  ['push', { run: runPushCommand, usage: PUSH_USAGE }],
  ['get', { run: runGetCommand, usage: GET_USAGE }],
  ['sources', { run: runSourcesCommand, usage: SOURCES_USAGE }],
  ['records', { run: runRecordsCommand, usage: RECORDS_USAGE }],
]);

// The sync is the one destructive command, so it rejects unexpected arguments
// (a typo, a stray flag) rather than ignoring them and silently fetching,
// writing, and deleting server records. `--help`/`-h` are intercepted before
// this runs (see dispatch), so anything reaching here is a genuine mistake.
async function runSyncCommand(args: string[]): Promise<void> {
  if (args.length > 0) {
    console.error(chalk.redBright(`Unexpected arguments: ${args.join(' ')}`));
    console.error(SYNC_USAGE);
    process.exitCode = 1;
    return;
  }

  await runDefaultSync();
}

// Aggregate each command's own USAGE string rather than maintaining a second,
// hand-written help blob that would drift — each command owns the single
// source of truth for its own usage, and this reads straight from COMMANDS.
const HELP_TEXT = [
  'markpost — sync markdown records with your markpost account',
  '',
  'Usage: markpost <command> [options]',
  '',
  'Commands:',
  ...[...COMMANDS.values()].flatMap((command) => ['', command.usage]),
  '',
  'Run `markpost help` (or `--help`) to see this message.',
].join('\n');

// A top-level help request optionally targets one command: `markpost help
// sync` prints just the sync usage. An unrecognized topic falls back to the
// full help rather than erroring — a help request should stay helpful.
function printHelp(topic: string | undefined): void {
  const command = topic ? COMMANDS.get(topic) : undefined;
  console.log(command ? command.usage : HELP_TEXT);
}

async function dispatch(): Promise<void> {
  // An explicit top-level help request is a success: print to stdout, exit 0.
  if (HELP_COMMANDS.has(commandName)) {
    printHelp(commandArgs[0]);
    return;
  }

  // A bare `markpost` (no command, or an empty-string arg) prints help but
  // fails loud (stderr + non-zero exit): it never runs the destructive sync,
  // and because bare `markpost` used to be the sync trigger, a silent exit 0
  // would let a cron job or wrapper "succeed" while quietly syncing nothing.
  // Run `markpost sync` to sync on purpose.
  if (!commandName) {
    console.error(HELP_TEXT);
    console.error(
      chalk.redBright('No command given. Run `markpost sync` to sync records.'),
    );
    process.exitCode = 1;
    return;
  }

  const command = COMMANDS.get(commandName);

  // An unrecognized command errors out rather than falling through to the
  // sync that deletes server records.
  if (!command) {
    console.error(chalk.redBright(`Unknown command: ${commandName}`));
    console.error(
      chalk.dim('Run `markpost help` to see the available commands.'),
    );
    process.exitCode = 1;
    return;
  }

  // Per-command help: `markpost <command> --help` prints that command's usage
  // with no side effects (no config check, no API call). Handled centrally so
  // every command supports it, not just the ones that happen to print usage on
  // a bad sub-argument.
  if (commandArgs.some((arg) => HELP_FLAG_ARGS.has(arg))) {
    console.log(command.usage);
    return;
  }

  await command.run(commandArgs);
}

await dispatch();

type WrittenRecord = { record: Record; filePath: string };

// Writes each record with the user's conflict strategy, keeping the record
// alongside the path it landed at. A `null` return means the `skip` strategy
// left an existing file untouched, so that record is dropped here and never
// reaches the delete step — deleting a record the CLI never persisted would
// lose it for good.
function writeRecords(
  records: Record[],
  conflictStrategy: ConflictStrategy,
): WrittenRecord[] {
  // One Set shared across the whole batch so `overwrite` can detect two
  // same-slug records in a single sync and avoid clobbering (see
  // writeMarkdown/resolveStrategyForSlug). `map` preserves order, so the
  // threading behaves the same as a sequential loop.
  const seenSlugs = new Set<string>();

  return records
    .map((record) => ({
      record,
      filePath: writeMarkdown(record, conflictStrategy, seenSlugs),
    }))
    .filter((written): written is WrittenRecord => written.filePath !== null);
}

// PATCHes the written records synced in bounded-concurrency batches, returning
// a success flag per record in the original order.
async function markRecordsInBatches(
  writtenRecords: WrittenRecord[],
): Promise<boolean[]> {
  const results: boolean[] = [];

  for (
    let start = 0;
    start < writtenRecords.length;
    start += MARK_SYNCED_CONCURRENCY
  ) {
    const batch = writtenRecords.slice(start, start + MARK_SYNCED_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(({ record, filePath }) =>
        markRecordSynced(record.uuid, filePath),
      ),
    );

    results.push(...batchResults);
  }

  return results;
}

// Surfaces mark-synced failures loudly (never as success): an unmarked record
// stays pending and gets re-written as a duplicate next run, so the user needs
// to know which files are affected. Still reports how many succeeded so a
// single failure in a large batch doesn't hide that the rest went through.
function reportMarkFailures(
  failures: WrittenRecord[],
  markedCount: number,
  spinner: Spinner,
): void {
  spinner.error(
    `Failed to mark ${failures.length} record(s) synced — written locally but still pending on the server; they may be re-written next run.`,
  );
  failures.forEach(({ record, filePath }) => {
    console.log(chalk.dim(`  ! ${record.uuid} -> ${filePath}`));
  });

  if (markedCount > 0) {
    console.log(
      chalk.dim(`  Marked ${markedCount} record(s) synced despite the above.`),
    );
  }

  process.exitCode = 1;
}

// Marks every written record synced on the server after a write, so the next
// run's pending-only fetch skips them — the autoDelete-off path's
// non-destructive equivalent of the delete step.
async function markWrittenRecordsSynced(
  writtenRecords: WrittenRecord[],
  spinner: Spinner,
): Promise<void> {
  if (writtenRecords.length === 0) {
    return;
  }

  spinner.start('Marking records synced...');

  const results = await markRecordsInBatches(writtenRecords);
  const failures = writtenRecords.filter((_written, index) => !results[index]);

  if (failures.length > 0) {
    reportMarkFailures(
      failures,
      writtenRecords.length - failures.length,
      spinner,
    );
    return;
  }

  spinner.success(`Marked ${writtenRecords.length} records synced!`);
}

// Default behavior when no subcommand is given: read the user's markpost
// settings, fetch all records, write each to a markdown file honoring the
// conflict strategy, then (only if autoDelete is on) delete the records that
// were actually written from the server.
async function runDefaultSync(): Promise<void> {
  const spinner = yoctoSpinner({ spinner: cliSpinners.dots });

  try {
    await checkConfig();

    // Read settings up front so both write and delete honor the user's
    // markpost preferences. A failed read (`ok: false`) still writes (suffix
    // is the safe non-destructive default) but never auto-deletes — deleting
    // server records is irreversible, so an unknown state must not fall
    // through to "delete". A successful read with no saved row (`settings:
    // null`) is a real account default, so it uses markpost's defaults
    // silently.
    const settingsResult = await fetchSettings();
    const settings = settingsResult.ok ? settingsResult.settings : null;
    const conflictStrategy = normalizeConflictStrategy(
      settings?.conflictStrategy,
    );
    const autoDelete = settingsResult.ok
      ? normalizeAutoDelete(settings?.autoDelete)
      : false;

    if (!settingsResult.ok) {
      console.log(
        chalk.yellow(
          'Could not read settings — writing records but skipping the auto-delete this run. Re-run once settings are reachable.',
        ),
      );
    }

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
    const writtenRecords = writeRecords(allRecords, conflictStrategy);
    spinner.success(`Wrote ${writtenRecords.length} records!`);
    writtenRecords.forEach(({ filePath }) => {
      console.log(chalk.dim(`  -> ${filePath}`));
    });

    // Surface records the `skip` strategy left unwritten: they stay on the
    // server (they're excluded from the delete below), so the user needs to
    // know they weren't synced rather than silently losing count of them.
    const skippedCount = allRecords.length - writtenRecords.length;
    if (skippedCount > 0) {
      console.log(
        chalk.yellow(
          `Skipped ${skippedCount} record(s): a file already exists at their path — left on the server.`,
        ),
      );
    }

    // Settings unreadable: autoDelete is forced off above and we don't know
    // the user's real preference, so mutate nothing on the server. Marking
    // synced here would be permanent and unrecoverable — a user whose real
    // setting is autoDelete on would have these records flipped to `synced`,
    // and the next pending-only fetch would never see them again, so the
    // deferred delete the warning above promises could never happen. Skipping
    // the mark risks re-writing these records as fresh `-2`/`-3` files on every
    // run until settings are readable again (bounded by the non-destructive
    // suffix default), which we warn about explicitly below — the lesser,
    // recoverable evil versus a permanent strand.
    if (!settingsResult.ok) {
      console.log(
        chalk.yellow(
          '  Settings unreadable — records left pending; they will be re-written as new files each run until settings are readable.',
        ),
      );
      return;
    }

    // autoDelete off (settings known): mark the written records synced so the
    // next run's pending-only fetch skips them instead of re-writing duplicate
    // files.
    if (!autoDelete) {
      await markWrittenRecordsSynced(writtenRecords, spinner);
      return;
    }

    // Delete Records — skipped when nothing was written (a bare DELETE with an
    // empty uuid list would be a wasted, possibly-rejected request reported as
    // success).
    if (writtenRecords.length === 0) {
      return;
    }

    spinner.start('Deleting records...');
    const deleteMeta = await deleteRecords(
      writtenRecords.map(({ record }) => record.uuid),
    );

    // deleteRecords swallows its own errors and returns null; reporting
    // success here would lie (records still on the server, re-fetched and
    // duplicated next run). Surface the failure loudly instead.
    if (!deleteMeta) {
      spinner.error(
        'Failed to delete records from the server — they were written locally but remain on the server.',
      );
      process.exitCode = 1;
      return;
    }

    spinner.success(`Deleted ${deleteMeta.deleted} records!`);
  } catch (error) {
    spinner.error('Something went wrong!');
    console.error(chalk.redBright(error));
    process.exitCode = 1;
  }
}
