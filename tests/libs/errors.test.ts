import { describe, expect, it, vi } from 'vitest';

import { logErrorMessage } from '@/libs/errors.js';

describe('logErrorMessage', () => {
  it('calls console.log', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logErrorMessage('title', 'message');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
