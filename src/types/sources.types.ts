export const SOURCE_TYPES = [
  'webhook',
  'email',
  'stripe',
  'github',
  'zapier',
  'rss',
  'shortcuts',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export type Source = {
  uuid: string;
  createdAt: string;
  type: string;
  name: string;
  provider: string | null;
  endpointSlug: string;
  routeFolder: string;
  lastHitAt: string | null;
  recordCount: number;
};

export type CreateSourceInput = {
  type: string;
  name: string;
  routeFolder: string;
  provider?: string;
};
