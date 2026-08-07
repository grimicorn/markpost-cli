import chalk from 'chalk';

// A missing or unknown subcommand (or required argument) is a usage error, not
// a no-op. Print the offending detail plus the command's usage to stderr and
// fail with exit 1 so a script or cron wrapper sees a failure instead of a
// silent "success". An explicit `--help`/`-h` is intercepted in index.ts's
// dispatch and never reaches a command, so anything that lands here is a
// genuine mistake worth failing on.
export const failWithUsage = (message: string, usage: string): void => {
  console.error(chalk.redBright(message));
  console.error(usage);
  process.exitCode = 1;
};
