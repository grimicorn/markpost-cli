import { config } from '@/libs/config.js';
import { ApiError } from '@/types/api.types.js';

export const getBaseUrl = () => {
  return process.env.BASE_URL ?? 'https://sync.danholloran.me';
};

export const getApiToken = () => {
  return process.env.API_TOKEN ?? config.get('apiToken');
};

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
