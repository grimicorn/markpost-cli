import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { config } from '@/libs/config.js';
import { Record } from '@/types/records.types.js';

const getOutputDirectory = () => {
  return (
    process.env.OUTPUT_DIRECTORY ?? (config.get('outputDirectory') as string)
  );
};

export const writeMarkdown = (record: Record) => {
  const outputDirectory = getOutputDirectory();

  if (!outputDirectory) {
    throw Error('Output directory is not set!');
  }

  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true });
  }

  writeFileSync(join(outputDirectory, `${record.title}.md`), record.content);
};

// Inverse of writeMarkdown: the title comes from the filename (no extension),
// mirroring how writeMarkdown names the file after the record's title.
export const readMarkdown = (
  filePath: string,
): Pick<Record, 'title' | 'content'> => {
  if (!existsSync(filePath)) {
    throw Error(`File not found: ${filePath}`);
  }

  return {
    title: basename(filePath, extname(filePath)),
    content: readFileSync(filePath, 'utf-8'),
  };
};
