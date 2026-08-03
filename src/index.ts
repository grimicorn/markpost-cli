#!/usr/bin/env node

import { deleteRecords, fetchAllRecords } from '@/libs/records.js';
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

const [command, ...commandArgs] = process.argv.slice(2);

const SYNC_COMMAND = 'sync';

// The fetch/write/delete sync is destructive (it can delete server records),
// so it must be requested explicitly by name — never triggered by a bare,
// accidental `markpost`. Its usage lives here because the sync lives here.
const SYNC_USAGE = `Usage: markpost sync

  Fetch all pending records, write each to a markdown file, and (when
  autoDelete is enabled) delete the written records from the server`;

// Aliases that print help instead of dispatching a command.
const HELP_FLAGS = new Set(['help', '--help', '-h']);

// One source of truth for dispatch: adding a command here is enough, unlike
// a parallel list of `if (command === 'x')` blocks plus a separately
// maintained "known commands" array that can drift out of sync.
// A Map (rather than a plain object) means a command named "toString" or
// "constructor" can't accidentally resolve to an inherited Object.prototype
// member instead of falling through to the "unknown command" branch.
const COMMAND_HANDLERS = new Map<string, (args: string[]) => Promise<void>>([
  ['push', runPushCommand],
  ['get', runGetCommand],
  ['sources', runSourcesCommand],
  ['records', runRecordsCommand],
  [SYNC_COMMAND, () => runDefaultSync()],
]);

// Aggregate each subcommand's own USAGE string rather than maintaining a
// second, hand-written help blob that would drift as commands change — each
// command owns the single source of truth for its own usage.
const HELP_TEXT = [
  'markpost — sync markdown records with your markpost account',
  '',
  'Usage: markpost <command> [options]',
  '',
  'Commands:',
  '',
  SYNC_USAGE,
  '',
  PUSH_USAGE,
  '',
  GET_USAGE,
  '',
  SOURCES_USAGE,
  '',
  RECORDS_USAGE,
  '',
  'Run `markpost help` (or `--help`) to see this message.',
].join('\n');

async function dispatch(): Promise<void> {
  // A bare `markpost` with no subcommand prints help instead of silently
  // running the destructive sync — an accidental invocation must never delete
  // server records. Run `markpost sync` to sync on purpose.
  if (command === undefined) {
    console.log(HELP_TEXT);
    return;
  }

  if (HELP_FLAGS.has(command)) {
    console.log(HELP_TEXT);
    return;
  }

  const commandHandler = COMMAND_HANDLERS.get(command);

  // An unrecognized subcommand errors out rather than falling through to the
  // sync that deletes server records.
  if (!commandHandler) {
    console.error(chalk.redBright(`Unknown command: ${command}`));
    console.error(
      chalk.dim('Run `markpost help` to see the available commands.'),
    );
    process.exitCode = 1;
    return;
  }

  await commandHandler(commandArgs);
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

    // Delete Records — skipped entirely when the user has autoDelete off, or
    // when nothing was written (a bare DELETE with an empty uuid list would
    // be a wasted, possibly-rejected request reported as success).
    if (!autoDelete) {
      console.log(
        chalk.dim('  autoDelete is off — records left on the server.'),
      );
      return;
    }

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
