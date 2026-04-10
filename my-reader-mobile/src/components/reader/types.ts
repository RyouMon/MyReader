export type ReaderState = {
  ready: boolean;
  currentPage: number;
  totalPages: number;
  progress: number;
  chapterTitle: string;
  loading: boolean;
  error: string | null;
};

export type ReaderTocItem = {
  label: string;
  pageIndex: number;
};
