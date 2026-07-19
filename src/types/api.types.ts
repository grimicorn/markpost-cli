export type ApiError = {
  status: string;
  title: string;
  detail: string;
  source: object;
};

export type ApiDeleteMeta = {
  deleted: number;
};

export type ApiData = {
  attributes?: object;
  errors?: ApiError[];
};

export type ApiLinks = {
  next: string | null;
  prev?: string | null;
};

export type ApiResponse = {
  meta?: object;
  data?: ApiData;
};

export type ApiListResponse = {
  meta?: object;
  links?: ApiLinks;
  data?: ApiData[];
};
