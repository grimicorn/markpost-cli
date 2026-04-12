export type ApiError = {
  status: string;
  title: string;
  detail: string;
  source: object;
};

export type ApiDeleteMeta = {
  deleted: number;
};

export type ApiResponse = {
  meta?: object;
  data?: {
    attributes?: object;
    errors?: ApiError[];
  };
};
