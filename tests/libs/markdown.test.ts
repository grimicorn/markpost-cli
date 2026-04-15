import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeMarkdown } from '@/libs/markdown.js';
import { Record } from '@/types/records.types.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn().mockReturnValue('/mock/home'),
}));

const mockRecord: Record = {
  uuid: 'abc-123',
  title: 'Test Title',
  content: 'Test Content',
  createdAt: '2024-01-01T00:00:00Z',
};

const vaultPath = join(
  '/mock/home',
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault',
  'TestVault',
);

describe('writeMarkdown', () => {
  beforeEach(() => {
    process.env.VAULT_DIRECTORY = 'TestVault';
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    delete process.env.VAULT_DIRECTORY;
    vi.clearAllMocks();
  });

  it('calls mkdirSync when the vault directory does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    writeMarkdown(mockRecord);
    expect(mkdirSync).toHaveBeenCalledWith(vaultPath, { recursive: true });
  });

  it('does not call mkdirSync when the vault directory already exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    writeMarkdown(mockRecord);
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('calls writeFileSync with the correct file path and content', () => {
    writeMarkdown(mockRecord);
    expect(writeFileSync).toHaveBeenCalledWith(
      join(vaultPath, `${mockRecord.title}.md`),
      mockRecord.content,
    );
  });

  it('uses VAULT_DIRECTORY env var in the vault path', () => {
    process.env.VAULT_DIRECTORY = 'MyVault';
    writeMarkdown(mockRecord);
    expect(existsSync).toHaveBeenCalledWith(
      expect.stringContaining('MyVault'),
    );
  });
});
