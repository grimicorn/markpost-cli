export type Record = {
  uuid: string;
  createdAt: string;
  title: string;
  content: string;
};

export type PaginatedRecordsMeta = {
  total: number;
  pageCount: number;
  size: number;
  page: number;
};
