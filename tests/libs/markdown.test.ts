import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readMarkdown, writeMarkdown } from '@/libs/markdown.js';
import { Record } from '@/types/records.types.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const outputDirectory = '/mock/output';

const mockRecord: Record = {
  uuid: 'abc-123',
  title: 'Test Title',
  content: 'Test Content',
  createdAt: '2024-01-01T00:00:00Z',
};

describe('writeMarkdown', () => {
  beforeEach(() => {
    process.env.OUTPUT_DIRECTORY = outputDirectory;
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    delete process.env.OUTPUT_DIRECTORY;
    vi.clearAllMocks();
  });

  it('throws when OUTPUT_DIRECTORY is not set', () => {
    delete process.env.OUTPUT_DIRECTORY;
    expect(() => writeMarkdown(mockRecord)).toThrow('Output directory is not set!');
  });

  it('calls mkdirSync when the output directory does not exist', () => {
    writeMarkdown(mockRecord);
    expect(mkdirSync).toHaveBeenCalledWith(outputDirectory, { recursive: true });
  });

  it('does not call mkdirSync when the output directory already exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    writeMarkdown(mockRecord);
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('calls writeFileSync with the correct file path and content', () => {
    writeMarkdown(mockRecord);
    expect(writeFileSync).toHaveBeenCalledWith(
      join(outputDirectory, `${mockRecord.title}.md`),
      mockRecord.content,
    );
  });
});

describe('readMarkdown', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when the file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(() => readMarkdown('./notes/missing.md')).toThrow(
      'File not found: ./notes/missing.md',
    );
  });

  it('derives the title from the filename without its extension', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(mockRecord.content);

    const result = readMarkdown('./notes/Test Title.md');

    expect(result.title).toBe('Test Title');
  });

  it('reads the file content as utf-8', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(mockRecord.content);

    const result = readMarkdown('./notes/Test Title.md');

    expect(readFileSync).toHaveBeenCalledWith(
      './notes/Test Title.md',
      'utf-8',
    );
    expect(result.content).toBe(mockRecord.content);
  });
});
