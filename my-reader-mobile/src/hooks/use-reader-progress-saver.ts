import { useEffect, useRef } from "react";
import { setReadingProgress } from "@/src/domain/reading-progress";
import type { Library } from "@/src/domain/types";
import type { ReaderState } from "@/src/features/reader/components/reader/types";
import { useAppStore } from "@/src/store/app-store";

const SAVE_DEBOUNCE_MS = 1600;

export function useReaderProgressSaver(
  activeLibraryId: string | null,
  loadState: { status: string; bookId?: number; format?: string } | null,
  readerState: ReaderState | null,
) {
  const bookContextRef = useRef<{ library: Library; bookId: number; format: string } | null>(null);

  useEffect(() => {
    if (loadState?.status === "ready" && loadState.bookId != null && loadState.format != null) {
      const state = useAppStore.getState();
      const lib = state.libraries.find((l) => l.id === activeLibraryId);
      if (lib) {
        bookContextRef.current = {
          library: lib,
          bookId: loadState.bookId,
          format: loadState.format,
        };
      }
    }
  }, [activeLibraryId, loadState]);

  const saveSeqRef = useRef(0);

  useEffect(() => {
    const ctx = bookContextRef.current;
    if (!ctx) return;
    if (!readerState?.ready || !readerState.locator) return;

    const seq = ++saveSeqRef.current;
    const t = setTimeout(() => {
      if (saveSeqRef.current !== seq) return;
      void (async () => {
        try {
          await setReadingProgress(
            ctx.library,
            ctx.bookId,
            ctx.format,
            readerState.locator!,
          );
        } catch (e) {
          console.error("[mobile-reader] save-progress-error", e);
        }
      })();
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [readerState?.ready, readerState?.locator]);
}
