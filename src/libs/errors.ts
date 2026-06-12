import chalk from 'chalk';

export const logErrorMessage = (title: string, message: string) => {
  return console.error(chalk.redBright(`${title}\n${message}`));
};
