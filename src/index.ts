#!/usr/bin/env node

import { deleteRecords, fetchAllRecords } from '@/libs/records.js';
import { writeMarkdown } from '@/libs/markdown.js';
import {
  fetchSettings,
  resolveSyncSettings,
  ResolvedSyncSettings,
} from '@/libs/settings.js';
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

// The last settings confirmed from a successful read. On a transient read
// failure an established daemon reuses these (forcing autoDelete off — the
// irreversible delete must never run on unconfirmed settings) so records aren't
// written in the wrong format or the loop silently stopped. Null until the
// first successful read, so an initial failure stays fully conservative.
let lastResolvedSettings: ResolvedSyncSettings | null = null;

// UUIDs already written this process. In an autoSync loop with autoDelete off,
// the same server records reappear every iteration; without this the suffix
// strategy would write test-title-1.md, test-title-2.md, ... endlessly. Scoped
// to the process, so a fresh `markpost` invocation starts empty. Keyed by uuid
// alone (the record contract carries no mutation timestamp), so a record edited
// on the server after being synced is not re-fetched within the same session.
const syncedRecordIds = new Set<string>();

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

  // The scheduler self-repeats the sync when the run reports `autoSync` on,
  // turning `markpost sync` into a self-scheduling daemon; a one-shot run
  // (autoSync off) returns after a single pass.
  await runSyncWithAutoSchedule(runDefaultSync);
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

function reportAutoDeleteOff(writtenCount: number): void {
  if (writtenCount <= 0) {
    return;
  }

  console.log(chalk.dim('  autoDelete is off — records left on the server.'));
}

// Resolves the server side of a write: with autoDelete off the records are
// intentionally left on the server; with it on they're deleted. Returns whether
// the records are settled server-side and therefore safe to mark synced — a
// failed or partial delete returns false so they're retried next iteration
// instead of being abandoned (and re-surfaces the error each time until it
// succeeds).
async function finalizeServerRecords(
  writtenRecords: WrittenRecord[],
  autoDelete: boolean,
  spinner: Spinner,
): Promise<boolean> {
  if (!autoDelete) {
    reportAutoDeleteOff(writtenRecords.length);
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

  // A partial delete (fewer removed than requested) must not be reported as a
  // full success — the survivors would be marked synced and abandoned. Fail
  // loud and retry them next iteration.
  if (deleteMeta.deleted < writtenRecords.length) {
    spinner.error(
      `Deleted ${deleteMeta.deleted} of ${writtenRecords.length} records — the rest remain on the server and will be retried.`,
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
  let autoSync = lastResolvedSettings?.autoSync ?? false;

  try {
    await checkConfig();

    // Read settings up front so both write and delete honor the user's
    // markpost preferences. A failed read (`ok: false`) reuses the last
    // confirmed settings when we have them (so records keep the user's real
    // format) but always forces autoDelete off — deleting server records is
    // irreversible, so an unconfirmed state must never delete. A successful
    // read with no saved row (`settings: null`) is a real account default, so
    // it uses markpost's defaults. resolveSyncSettings owns those fallbacks
    // (see settings.ts).
    const settingsResult = await fetchSettings();
    const resolved = resolveSyncSettings(settingsResult);

    if (settingsResult.ok) {
      lastResolvedSettings = resolved;
    }

    // On a failed read with a prior good read, reuse it (autoDelete forced off);
    // otherwise take the resolver's conservative defaults.
    const {
      conflictStrategy,
      autoDelete,
      autoSync: resolvedAutoSync,
      includeFrontmatter,
    } = settingsResult.ok || !lastResolvedSettings
      ? resolved
      : { ...lastResolvedSettings, autoDelete: false };
    autoSync = resolvedAutoSync;

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
