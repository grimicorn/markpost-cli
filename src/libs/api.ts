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

// Every error response the API sends back is a non-2xx status carrying
// `data.errors`, regardless of whether the success shape is a single
// resource or a list. Accept `unknown` so this works for both response
// shapes without callers needing to reshape their body first.
export const assertApiSuccess = (response: Response, body: unknown): void => {
  const errors = (body as { data?: { errors?: ApiError[] } })?.data?.errors;
  const hasErrors = Boolean(errors && errors.length > 0);

  if (!response.ok || hasErrors) {
    throw new Error(formatErrorMessages(errors ?? []));
  }
};
