import {
  bookAnchorFromReaderState,
  type BookAnchor,
} from "my-reader-tools/progress/BookAnchor";

/** PDF 页码（0-based）→ 与 tools 一致的 {@link BookAnchor}，便于日后与同步层对齐。 */
export function pdfBookAnchorFromPage(pageIndex0Based: number): BookAnchor {
  return bookAnchorFromReaderState({ chapterIndex: pageIndex0Based });
}
