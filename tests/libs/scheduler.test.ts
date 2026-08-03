import { describe, expect, it, vi } from 'vitest';

import {
  AUTO_SYNC_INTERVAL_MS,
  runSyncWithAutoSchedule,
  type ScheduleFn,
} from '@/libs/scheduler.js';

describe('runSyncWithAutoSchedule', () => {
  it('schedules another run at the auto-sync interval when the sync reports autoSync on', async () => {
    const runSync = vi.fn().mockResolvedValue(true);
    const schedule: ScheduleFn = vi.fn();

    await runSyncWithAutoSchedule(runSync, schedule);

    expect(runSync).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(
      expect.any(Function),
      AUTO_SYNC_INTERVAL_MS,
    );
  });

  it('does not schedule another run when the sync reports autoSync off', async () => {
    const runSync = vi.fn().mockResolvedValue(false);
    const schedule: ScheduleFn = vi.fn();

    await runSyncWithAutoSchedule(runSync, schedule);

    expect(runSync).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('re-runs the sync when the scheduled callback fires', async () => {
    const runSync = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    let scheduledCallback: (() => void) | undefined;
    const schedule: ScheduleFn = vi.fn((callback) => {
      scheduledCallback = callback;
    });

    await runSyncWithAutoSchedule(runSync, schedule);

    expect(scheduledCallback).toBeDefined();
    scheduledCallback?.();
    // The scheduled callback re-enters the loop asynchronously; let its
    // microtasks settle before asserting the second run happened.
    await vi.waitFor(() => expect(runSync).toHaveBeenCalledTimes(2));
    // Second run reported autoSync off, so the loop stops there.
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('honors a custom interval', async () => {
    const runSync = vi.fn().mockResolvedValue(true);
    const schedule: ScheduleFn = vi.fn();
    const customInterval = 1234;

    await runSyncWithAutoSchedule(runSync, schedule, customInterval);

    expect(schedule).toHaveBeenCalledWith(expect.any(Function), customInterval);
  });
});
