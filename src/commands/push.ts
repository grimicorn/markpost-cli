import chalk from 'chalk';
import { createRecord } from '@/libs/records.js';
import { readMarkdown } from '@/libs/markdown.js';
import { resolveMarkdownInputs } from '@/libs/files.js';
import { checkConfig } from '@/libs/config.js';

export const USAGE = `Usage: markpost push <path...>

  path  One or more markdown files, directories (recursed for .md files),
        or glob patterns to create records from`;

interface PushResult {
  filePath: string;
  pushed: boolean;
}

const toMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const pushFile = async (filePath: string): Promise<PushResult> => {
  try {
    const { title, content } = readMarkdown(filePath);
    const record = await createRecord(title, content);

    if (!record) {
      console.error(chalk.redBright(`Failed to push "${filePath}".`));
      return { filePath, pushed: false };
    }

    console.log(chalk.greenBright(`Pushed "${record.title}" (${record.uuid})`));
    return { filePath, pushed: true };
  } catch (error) {
    console.error(
      chalk.redBright(`Failed to push "${filePath}": ${toMessage(error)}`),
    );
    return { filePath, pushed: false };
  }
};

// Push each file in turn rather than in parallel: a bulk import can be large
// and sequential requests keep the output ordered and the server unhammered.
const pushFiles = async (filePaths: string[]): Promise<PushResult[]> => {
  const results: PushResult[] = [];

  for (const filePath of filePaths) {
    results.push(await pushFile(filePath));
  }

  return results;
};

const reportSummary = (
  results: PushResult[],
  unresolvedCount: number,
): void => {
  const succeeded = results.filter((result) => result.pushed).length;
  const failed = results.length - succeeded;

  console.log(
    chalk.dim(`Pushed ${succeeded}/${results.length} file(s) successfully.`),
  );

  if (failed > 0 || unresolvedCount > 0) {
    process.exitCode = 1;
  }
};

export const runPushCommand = async (args: string[]): Promise<void> => {
  try {
    const paths = args.filter((arg) => arg.length > 0);

    if (paths.length === 0) {
      console.log(USAGE);
      return;
    }

    await checkConfig();

    const { files, missing, skipped } = resolveMarkdownInputs(paths);

    for (const input of missing) {
      console.error(chalk.redBright(`No markdown files found for "${input}".`));
    }

    for (const path of skipped) {
      console.error(chalk.redBright(`Skipped unreadable path "${path}".`));
    }

    if (files.length === 0) {
      console.error(chalk.redBright('No markdown files to push.'));
      process.exitCode = 1;
      return;
    }

    const results = await pushFiles(files);
    reportSummary(results, missing.length + skipped.length);
  } catch (error) {
    console.error(chalk.redBright(toMessage(error)));
    process.exitCode = 1;
  }
};
