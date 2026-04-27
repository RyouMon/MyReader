import type { BookDetail } from "my-reader-tools/types/book";

import type { BookItem, MobileLibrary, WebDavDataSource } from "../../../data/types";
import type { LocalState } from "../../../sync/file_state";
import type { ThemePalette } from "../../../design/tokens";

export type DetailColors = {
  accent: string;
  accentPressed: string;
  accentText: string;
  background: string;
  border: string;
  card: string;
  disabledBg: string;
  disabledText: string;
  muted: string;
  palette: ThemePalette;
  progressTrack: string;
  sectionBg: string;
  success: string;
  successBg: string;
  tagBg: string;
  tagText: string;
  tertiary: string;
  text: string;
};

export type InfoCardItem = {
  label: string;
  mono?: boolean;
  value: string;
};

export type FormatInfo = { relativePath: string; localState: LocalState | null };

export type BookDetailContentProps = {
  activeLibrary: MobileLibrary;
  bookId: string;
  colors: DetailColors;
  detail: BookDetail | null;
  detailError: string | null;
  listBook: BookItem | null;
  loadingDetail: boolean;
  onOpenReader: (bookId: string, format: string | null) => void;
  onSelectFormat: (bookId: string, format: string | null) => void;
  onToggleSynopsis: (bookId: string) => void;
  selectedFormat: string | null;
  synopsisExpanded: boolean;
  webDavSource: WebDavDataSource | null;
};
