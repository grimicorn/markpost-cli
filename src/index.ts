#!/usr/bin/env node

import { deleteRecords, fetchAllRecords } from '@/libs/records.js';
import { writeMarkdown } from '@/libs/markdown.js';
import { fetchSettings, resolveSyncSettings } from '@/libs/settings.js';
import { runPushCommand } from '@/commands/push.js';
import { runGetCommand } from '@/commands/get.js';
import { runSourcesCommand } from '@/commands/sources.js';
import { runRecordsCommand } from '@/commands/records.js';
import yoctoSpinner from 'yocto-spinner';
import cliSpinners from 'cli-spinners';
import chalk from 'chalk';
import { checkConfig } from '@/libs/config.js';
import {
  AUTO_SYNC_INTERVAL_MS,
  runSyncWithAutoSchedule,
} from '@/libs/scheduler.js';
import { Record } from '@/types/records.types.js';
import { ConflictStrategy } from '@/types/settings.types.js';

// Declared before the top-level command dispatch below: that dispatch awaits
// runDefaultSync during module evaluation, so any module const it reads must
// already be initialized (a const declared lower would be in its temporal dead
// zone when the sync runs).
const MS_PER_MINUTE = 60_000;
const AUTO_SYNC_INTERVAL_MINUTES = AUTO_SYNC_INTERVAL_MS / MS_PER_MINUTE;

// One-shot guard so the daemon announces autoSync mode once per process rather
// than reprinting the banner on every scheduled iteration.
let autoSyncAnnounced = false;

// The last autoSync value confirmed from a successful settings read. Once a
// daemon is established, a transient failure *before* the next read (e.g.
// checkConfig throwing) shouldn't silently end the loop — it resumes from this.
// Stays false until the first successful read, so a failure on the very first
// iteration never starts a loop.
let lastKnownAutoSync = false;

// UUIDs already written this process. In an autoSync loop with autoDelete off,
// the same server records reappear every iteration; without this the suffix
// strategy would write test-title-1.md, test-title-2.md, ... endlessly. Scoped
// to the process, so a fresh `markpost` invocation starts empty. Keyed by uuid
// alone (the record contract carries no mutation timestamp), so a record edited
// on the server after being synced is not re-fetched within the same session.
const syncedRecordIds = new Set<string>();

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

// autoSync turns the CLI into a self-scheduling daemon, so a bare `markpost`
// invocation won't return. Announce it once per process (not on every
// scheduled iteration) so the user knows the process is intentionally staying
// alive without spamming the banner every interval.
function announceAutoSync(autoSync: boolean): void {
  if (!autoSync || autoSyncAnnounced) {
    return;
  }

  autoSyncAnnounced = true;
  console.log(
    chalk.dim(
      `  autoSync is on — will re-sync every ${AUTO_SYNC_INTERVAL_MINUTES}m (Ctrl-C to stop).`,
    ),
  );
}

type Spinner = ReturnType<typeof yoctoSpinner>;

// Surface records the `skip` strategy left unwritten: they stay on the server
// (they're excluded from the delete), so the user needs to know they weren't
// synced rather than silently losing count of them.
function reportSkipped(skippedCount: number): void {
  if (skippedCount <= 0) {
    return;
  }

  console.log(
    chalk.yellow(
      `Skipped ${skippedCount} record(s): a file already exists at their path — left on the server.`,
    ),
  );
}

// Resolves the server side of a write: with autoDelete off the records are
// intentionally left on the server; with it on they're deleted. Returns whether
// the records are settled server-side and therefore safe to mark synced — a
// failed delete returns false so they're retried next iteration instead of
// being abandoned (and re-surfaces the error each time until it succeeds).
async function finalizeServerRecords(
  writtenRecords: WrittenRecord[],
  autoDelete: boolean,
  spinner: Spinner,
): Promise<boolean> {
  if (!autoDelete) {
    if (writtenRecords.length > 0) {
      console.log(
        chalk.dim('  autoDelete is off — records left on the server.'),
      );
    }
    return true;
  }

  // A bare DELETE with an empty uuid list would be a wasted, possibly-rejected
  // request reported as success.
  if (writtenRecords.length === 0) {
    return true;
  }

  spinner.start('Deleting records...');
  const deleteMeta = await deleteRecords(
    writtenRecords.map(({ record }) => record.uuid),
  );

  // deleteRecords swallows its own errors and returns null; reporting success
  // here would lie (records still on the server, re-fetched next run). Surface
  // the failure loudly and report "not settled" so they're retried.
  if (!deleteMeta) {
    spinner.error(
      'Failed to delete records from the server — they were written locally but remain on the server.',
    );
    process.exitCode = 1;
    return false;
  }

  spinner.success(`Deleted ${deleteMeta.deleted} records!`);
  return true;
}

// Default behavior when no subcommand is given: read the user's markpost
// settings, fetch all records, write each to a markdown file honoring the
// conflict strategy, then (only if autoDelete is on) delete the records that
// were actually written from the server. Returns whether `autoSync` is on so
// the scheduler can decide to repeat the sync (see runSyncWithAutoSchedule).
async function runDefaultSync(): Promise<boolean> {
  const spinner = yoctoSpinner({ spinner: cliSpinners.dots });
  // Reset per iteration: in autoSync's daemon loop a transient failure that
  // set exitCode=1 must not stick and mark a later, fully-successful run as
  // failed to whatever supervises the process.
  process.exitCode = 0;

  // Start from the last confirmed value so a failure before the settings read
  // (checkConfig, an unreachable settings endpoint) resumes an already-running
  // daemon rather than silently ending it. Stays false until the first
  // successful read, so a failure on the very first iteration never loops.
  let autoSync = lastKnownAutoSync;

  try {
    await checkConfig();

    // Read settings up front so both write and delete honor the user's
    // markpost preferences. A failed read (`ok: false`) still writes (suffix
    // is the safe non-destructive default) but never auto-deletes — deleting
    // server records is irreversible, so an unknown state must not fall
    // through to "delete". A successful read with no saved row (`settings:
    // null`) is a real account default, so it uses markpost's defaults
    // silently. resolveSyncSettings owns those fallbacks (see settings.ts).
    const settingsResult = await fetchSettings();
    const {
      conflictStrategy,
      autoDelete,
      autoSync: resolvedAutoSync,
      includeFrontmatter,
    } = resolveSyncSettings(settingsResult);

    // Only a successful read updates the sync mode; a transient read failure
    // keeps an established daemon on its last confirmed value.
    if (settingsResult.ok) {
      autoSync = resolvedAutoSync;
      lastKnownAutoSync = resolvedAutoSync;
    }

    if (!settingsResult.ok) {
      console.log(
        chalk.yellow(
          'Could not read settings — writing records but skipping the auto-delete this run. Re-run once settings are reachable.',
        ),
      );
    }

    announceAutoSync(autoSync);

    // Fetch records
    spinner.start('Fetching records...');
    const allRecords = await fetchAllRecords();
    // Drop records already written earlier this process so a self-scheduling
    // run doesn't re-write them (see syncedRecordIds).
    const newRecords = allRecords.filter(
      (record) => !syncedRecordIds.has(record.uuid),
    );

    if (newRecords.length === 0) {
      spinner.success(
        autoSync ? 'No new records.' : 'No new records, exiting...',
      );
      return autoSync;
    }

    spinner.success(`Fetched ${newRecords.length} records!`);

    // Write Records
    spinner.start('Writing records...');
    const writtenRecords = writeRecords(
      newRecords,
      conflictStrategy,
      includeFrontmatter,
    );
    spinner.success(`Wrote ${writtenRecords.length} records!`);
    writtenRecords.forEach(({ filePath }) => {
      console.log(chalk.dim(`  -> ${filePath}`));
    });

    reportSkipped(newRecords.length - writtenRecords.length);

    const settled = await finalizeServerRecords(
      writtenRecords,
      autoDelete,
      spinner,
    );

    // Mark synced only once settled server-side: a failed delete leaves them
    // unmarked so the next iteration retries instead of abandoning them.
    if (settled) {
      writtenRecords.forEach(({ record }) => syncedRecordIds.add(record.uuid));
    }

    return autoSync;
  } catch (error) {
    spinner.error('Something went wrong!');
    console.error(chalk.redBright(error));
    process.exitCode = 1;
    // Keep the daemon alive across a transient failure (a network blip
    // shouldn't end an autoSync session); the next iteration resets exitCode
    // and retries. `autoSync` is still `false` if we failed before reading
    // settings, so a run that never got that far won't start looping.
    return autoSync;
  }
}
