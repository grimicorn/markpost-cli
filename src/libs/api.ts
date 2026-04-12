import chalk from 'chalk';
import { ApiError } from '@/types/api.types.js';

// @todo Test logError
export const logErrorMessage = (title: string, message: string) => {
  return console.log(chalk.redBright(`${title}\n${message}`));
};

// @todo Test getBaseUrl
export const getBaseUrl = () => {
  return process.env.BASE_URL ?? 'https://sync.danholloran.me';
};

// @todo Test getApiToken
export const getApiToken = () => {
  return process.env.API_TOKEN;
};

// @todo Test formatErrorMessages
export const formatErrorMessages = (errors: ApiError[]) => {
  if (errors.length === 1) {
    return `${errors?.[0]?.title}: ${errors?.[0]?.detail}`;
  }

  if (errors.length > 1) {
    return errors
      .map((error) => `- ${error.title}: ${error.detail}`)
      .join('\n');
  }

  return 'Unknown error occurred';
};
