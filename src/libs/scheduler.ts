// The seam that turns the one-shot default sync into a self-scheduling one
// when the user's `autoSync` setting is on. The timer is isolated here behind
// a `ScheduleFn` so the scheduling decision can be tested without waiting on a
// real clock: a test injects a fake `schedule` that captures the callback.

// How long to wait between self-scheduled syncs. Named so the interval isn't a
// bare literal and tests can assert against it.
export const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export type ScheduleFn = (callback: () => void, delayMs: number) => void;

// Real scheduler: a plain `setTimeout`, unref'd so a pending self-sync timer
// never keeps the process (or a test run) alive on its own — the daemon lives
// only as long as there's other work holding the event loop open.
export const defaultSchedule: ScheduleFn = (callback, delayMs) => {
  setTimeout(callback, delayMs).unref();
};

// Runs one sync, then — only if that run reported `autoSync` on — schedules the
// next after `intervalMs`. Re-scheduling from the completed run (rather than a
// fixed `setInterval`) keeps runs sequential, so a slow sync can't overlap the
// next one, and lets a run that flips `autoSync` off stop the loop cleanly.
export const runSyncWithAutoSchedule = async (
  runSync: () => Promise<boolean>,
  schedule: ScheduleFn = defaultSchedule,
  intervalMs: number = AUTO_SYNC_INTERVAL_MS,
): Promise<void> => {
  const autoSyncEnabled = await runSync();

  if (!autoSyncEnabled) {
    return;
  }

  schedule(() => {
    void runSyncWithAutoSchedule(runSync, schedule, intervalMs);
  }, intervalMs);
};
