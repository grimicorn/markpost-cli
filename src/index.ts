#!/usr/bin/env node

import { deleteRecords, fetchAllRecords } from '@/libs/records.js';
import { writeMarkdown } from '@/libs/markdown.js';
import { fetchSettings } from '@/libs/settings.js';
import { runPushCommand } from '@/commands/push.js';
import { runGetCommand } from '@/commands/get.js';
import { runSourcesCommand } from '@/commands/sources.js';
import { runRecordsCommand } from '@/commands/records.js';
import yoctoSpinner from 'yocto-spinner';
import cliSpinners from 'cli-spinners';
import chalk from 'chalk';
import { checkConfig } from '@/libs/config.js';
import { runSyncWithAutoSchedule } from '@/libs/scheduler.js';
import { Record } from '@/types/records.types.js';
import {
  ConflictStrategy,
  normalizeAutoDelete,
  normalizeAutoSync,
  normalizeConflictStrategy,
  normalizeFrontmatterEnabled,
} from '@/types/settings.types.js';

const [command, ...commandArgs] = process.argv.slice(2);

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
]);

const commandHandler = COMMAND_HANDLERS.get(command);

if (commandHandler) {
  await commandHandler(commandArgs);
}

if (command && !commandHandler) {
  console.error(chalk.redBright(`Unknown command: ${command}`));
  process.exitCode = 1;
}

// Only run the default fetch/write/delete sync when no subcommand was
// given at all; an unrecognized subcommand must error out above instead
// of silently falling through to a sync that deletes server records. The
// scheduler self-repeats the sync when the run reports `autoSync` on.
if (!command) {
  await runSyncWithAutoSchedule(runDefaultSync);
}

type WrittenRecord = { record: Record; filePath: string };

// Writes each record with the user's conflict strategy, keeping the record
// alongside the path it landed at. A `null` return means the `skip` strategy
// left an existing file untouched, so that record is dropped here and never
// reaches the delete step — deleting a record the CLI never persisted would
// lose it for good.
function writeRecords(
  records: Record[],
  conflictStrategy: ConflictStrategy,
  includeFrontmatter: boolean,
): WrittenRecord[] {
  // One Set shared across the whole batch so `overwrite` can detect two
  // same-slug records in a single sync and avoid clobbering (see
  // writeMarkdown/resolveStrategyForSlug). `map` preserves order, so the
  // threading behaves the same as a sequential loop.
  const seenSlugs = new Set<string>();

  return records
    .map((record) => ({
      record,
      filePath: writeMarkdown(
        record,
        conflictStrategy,
        seenSlugs,
        includeFrontmatter,
      ),
    }))
    .filter((written): written is WrittenRecord => written.filePath !== null);
}

// Default behavior when no subcommand is given: read the user's markpost
// settings, fetch all records, write each to a markdown file honoring the
// conflict strategy, then (only if autoDelete is on) delete the records that
// were actually written from the server. Returns whether `autoSync` is on so
// the scheduler can decide to repeat the sync (see runSyncWithAutoSchedule).
async function runDefaultSync(): Promise<boolean> {
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
    // A failed settings read leaves autoSync off: without confirmed settings
    // we don't spin up a self-scheduling daemon (mirrors the conservative
    // autoDelete above). Frontmatter defaults to on — the safe,
    // non-destructive default, matching how conflictStrategy falls back.
    const autoSync = settingsResult.ok
      ? normalizeAutoSync(settings?.autoSync)
      : false;
    const includeFrontmatter = settingsResult.ok
      ? normalizeFrontmatterEnabled(settings?.frontmatter)
      : true;

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
      return autoSync;
    }

    spinner.success(`Fetched ${allRecords.length} records!`);

    // Write Records
    spinner.start('Writing records...');
    const writtenRecords = writeRecords(
      allRecords,
      conflictStrategy,
      includeFrontmatter,
    );
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
      return autoSync;
    }

    if (writtenRecords.length === 0) {
      return autoSync;
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
      return autoSync;
    }

    spinner.success(`Deleted ${deleteMeta.deleted} records!`);
    return autoSync;
  } catch (error) {
    spinner.error('Something went wrong!');
    console.error(chalk.redBright(error));
    process.exitCode = 1;
    // Don't self-schedule after an unexpected failure — a crashing run
    // shouldn't spin a daemon that just keeps crashing.
    return false;
  }
}
