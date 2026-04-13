export type ReaderState = {
  ready: boolean;
  currentPage: number;
  totalPages: number;
  progress: number;
  chapterTitle: string;
  loading: boolean;
  error: string | null;
  canGoPrev?: boolean;
  canGoNext?: boolean;
};

export type ReaderTocItem = {
  id: string;
  label: string;
  pageIndex: number;
  chapterIndex?: number;
  href?: string;
};
