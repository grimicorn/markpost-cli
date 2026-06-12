import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Record } from '@/types/records.types.js';

const getOutputDirectory = () => {
  return process.env.OUTPUT_DIRECTORY as string;
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
