import { useEffect, useRef, useState } from "react";
import { File } from "expo-file-system";
import type { Locator } from "@ryoumon/react-native-readium";
import { resolveReadFormat } from "my-reader-tools/utils";
import { pageIndexFromFixedLocator } from "@/src/components/reader/locator";
import {
  buildCoverUri,
  getBookFormatPaths,
  materializeBookFileToCache,
  readBookDetailFromMetadata,
} from "@/src/data/calibre";
import { enforceReaderCacheLimit } from "@/src/data/cache";
import { getReadingProgress } from "@/src/data/reading-progress";
import type { Library, WebDavDataSource } from "@/src/data/types";
import { localFileUriFor, resolveLibraryBooksDir } from "@/src/sync/backend";
import { getFileState, type LocalState } from "@/src/sync/file_state";
import { useAppStore } from "@/src/store/app-store";

const INITIAL_READER_PAGE = 0;

function isDownloadedLocalState(state: LocalState | null | undefined): boolean {
  return state === "present" || state === "local_only" || state === "dirty_push";
}

async function readFileHeaderBytes(file: File, byteCount: number): Promise<Uint8Array> {
  const safeByteCount = Math.max(0, byteCount | 0);
  if (safeByteCount === 0) return new Uint8Array();
  const handle = file.open();
  try {
    return handle.readBytes(safeByteCount);
  } finally {
    handle.close();
  }
}

async function hasExpectedReaderSignature(file: File, format: string): Promise<boolean> {
  if (!file.exists || (file.size ?? 0) <= 0) return false;
  const upper = format.toUpperCase();
  if (upper !== "EPUB" && upper !== "CBZ" && upper !== "PDF") return true;
  const bytes = await readFileHeaderBytes(file, upper === "PDF" ? 4 : 2);

  if (upper === "PDF") {
    return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

async function resolveDownloadedWebDavBookFile(input: {
  libraryId: string;
  dataSourceId: string;
  cacheDirUri: string;
  library: Library;
  calibreBookId: number;
  format: string;
}): Promise<File | null> {
  const paths = await getBookFormatPaths(input.library, input.calibreBookId);
  const match = paths.find((path) => path.format.toUpperCase() === input.format.toUpperCase());
  if (!match) return null;

  const state = await getFileState(
    { dataSourceId: input.dataSourceId, libraryId: input.libraryId },
    match.relativePath,
  );
  if (!isDownloadedLocalState(state?.localState)) return null;

  const file = new File(localFileUriFor(input.cacheDirUri, match.relativePath));
  if (await hasExpectedReaderSignature(file, input.format)) return file;
  if (file.exists) file.delete();
  return null;
}

export type LoadState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | {
      status: "ready";
      /** EPUB 容器 `file://` URI，供 Readium 转原生路径打开。 */
      epubFileUri: string | null;
      /** PDF：原生阅读器使用的稳定本地 `file://`（不经由 base64） */
      pdfLocalUri: string | null;
      bookArchiveUri: string | null;
      bookArchiveFingerprint: string | null;
      bookArchiveOwned: boolean;
      bookId: number;
      format: string;
      title: string;
      initialPage: number;
      initialLocator: Locator | null;
      layoutMode: "fixedLayout" | "reflowable" | "unknown";
    };

export function useBookLoader(
  id: string | undefined,
  formatParam: string | undefined,
  activeLibraryId: string | null,
  maxCacheSizeMB: number,
) {
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    message: "正在加载书籍…",
  });
  const [coverUri, setCoverUri] = useState<string | undefined>(undefined);
  const [bookTitle, setBookTitle] = useState<string | undefined>(undefined);
  const loadStateRef = useRef<LoadState>({ status: "loading", message: "正在加载书籍…" });

  useEffect(() => {
    loadStateRef.current = loadState;
  }, [loadState]);

  useEffect(() => {
    console.info("[mobile-reader] effect:start", {
      id,
      formatParam,
      activeLibraryId,
      hasActiveLibrary: Boolean(activeLibraryId),
    });

    if (!id || !activeLibraryId) {
      console.error("[mobile-reader] effect:missing-input", {
        id,
        hasActiveLibrary: Boolean(activeLibraryId),
      });
      setLoadState({
        status: "error",
        message: !id ? "缺少书籍参数" : "未选择书库",
      });
      return;
    }

    // Guard: 如果已经加载好了同一本书的同一格式，跳过重复加载
    if (
      loadStateRef.current.status === "ready" &&
      loadStateRef.current.bookId === Number(id) &&
      loadStateRef.current.format.toUpperCase() === (formatParam ?? "").toUpperCase()
    ) {
      console.info("[mobile-reader] effect:skip-duplicate-load", {
        id,
        formatParam,
        bookId: loadStateRef.current.bookId,
        format: loadStateRef.current.format,
      });
      return;
    }

    const state = useAppStore.getState();
    const currentLibrary = state.libraries.find((l) => l.id === activeLibraryId) ?? null;
    if (!currentLibrary) {
      console.error("[mobile-reader] effect:library-not-found", { activeLibraryId });
      setLoadState({ status: "error", message: "未选择书库" });
      return;
    }
    const lib = currentLibrary;

    const currentWebDavSource =
      lib.sourceType === "webdav"
        ? (state.dataSources.find(
            (d) => d.id === lib.dataSourceId && d.type === "webdav"
          ) as WebDavDataSource | undefined) ?? null
        : null;

    let cancelled = false;

    async function load() {
      try {
        enforceReaderCacheLimit(maxCacheSizeMB);
        console.info("[mobile-reader] load:start", {
          id,
          formatParam,
          libraryId: lib.id,
          sourceType: lib.sourceType,
        });
        setLoadState({ status: "loading", message: "正在读取书籍信息…" });

        // 优先从已有的 books 列表中获取封面和标题，减少等待感
        const bookItem = useAppStore.getState().books.find((b) => b.id === id);
        if (bookItem?.coverUri) {
          setCoverUri(typeof bookItem.coverUri === "string" ? bookItem.coverUri : bookItem.coverUri.uri);
        }
        if (bookItem?.title) {
          setBookTitle(bookItem.title);
        }

        const calibreId = Number(id);
        if (!Number.isFinite(calibreId) || calibreId <= 0) {
          console.error("[mobile-reader] load:invalid-book-id", { id, calibreId });
          setLoadState({ status: "error", message: "无效的书籍 ID" });
          return;
        }

        const detail = await readBookDetailFromMetadata(lib, calibreId);
        if (cancelled) return;
        if (!detail) {
          console.error("[mobile-reader] load:book-detail-not-found", {
            calibreId,
            libraryId: lib.id,
          });
          setLoadState({ status: "error", message: "在书库中未找到该书" });
          return;
        }

        // 如果 books 列表中没有封面，用 detail 构建本地封面 URI
        if (!bookItem?.coverUri && detail.hasCover && detail.path) {
          const builtCover = buildCoverUri(lib, detail.path, detail.hasCover);
          if (builtCover) setCoverUri(builtCover);
        }
        setBookTitle(detail.title);

        console.info("[mobile-reader] load:book-detail-ready", {
          calibreId,
          title: detail.title,
          formats: detail.formats,
        });

        const fmt = resolveReadFormat(detail.formats, formatParam);
        if (!fmt) {
          console.error("[mobile-reader] load:no-supported-format", {
            calibreId,
            formats: detail.formats,
            formatParam,
          });
          setLoadState({
            status: "error",
            message: `该书没有可阅读的格式（需要 EPUB、CBZ 或 PDF）`,
          });
          return;
        }

        const fmtUpper = fmt.toUpperCase();
        console.info("[mobile-reader] load:resolved-format", {
          calibreId,
          resolvedFormat: fmtUpper,
        });

        setLoadState({
          status: "loading",
          message: currentWebDavSource ? "正在从 WebDAV 下载书籍…" : "正在加载书籍文件…",
        });

        const detailLayoutMode =
          fmtUpper === "EPUB" ? "reflowable" : fmtUpper === "PDF" || fmtUpper === "CBZ" ? "fixedLayout" : "unknown";

        const needsNativeComicPath = fmtUpper === "CBZ";
        const needsPdfNativePath = fmtUpper === "PDF";
        const needsEpubExtract = fmtUpper === "EPUB";

        const syncCacheDirUri = currentWebDavSource ? resolveLibraryBooksDir(lib.id) : undefined;
        const downloadedWebDavBookFile =
          currentWebDavSource && syncCacheDirUri && lib.dataSourceId
            ? await resolveDownloadedWebDavBookFile({
                libraryId: lib.id,
                dataSourceId: lib.dataSourceId,
                cacheDirUri: syncCacheDirUri,
                library: lib,
                calibreBookId: calibreId,
                format: fmt,
              })
            : null;

        const localBookFile = !currentWebDavSource && needsNativeComicPath
          ? await materializeBookFileToCache(lib, calibreId, fmt, "local-comic")
          : null;
        const localEpubFile =
          needsEpubExtract && !currentWebDavSource
            ? await materializeBookFileToCache(lib, calibreId, fmt, "local-epub")
            : null;
        const webDavEpubFile =
          needsEpubExtract && currentWebDavSource ? downloadedWebDavBookFile : null;
        const webDavBookFile = currentWebDavSource && needsNativeComicPath ? downloadedWebDavBookFile : null;

        const pdfLocalFile = needsPdfNativePath
          ? currentWebDavSource
            ? downloadedWebDavBookFile
            : await materializeBookFileToCache(lib, calibreId, fmt, "local-pdf")
          : null;

        const epubArchiveFile = localEpubFile ?? webDavEpubFile;
        const requiredWebDavFile = currentWebDavSource && (needsEpubExtract || needsNativeComicPath || needsPdfNativePath);
        if (requiredWebDavFile && !downloadedWebDavBookFile) {
          setLoadState({
            status: "error",
            message: "请先在书籍详情中下载该格式，再打开阅读。",
          });
          return;
        }

        if (cancelled) return;

        console.info("[mobile-reader] load:file-ready", {
          calibreId,
          format: fmtUpper,
          archiveUri: localBookFile?.uri ?? webDavBookFile?.uri ?? epubArchiveFile?.uri ?? null,
          epubFileUri: needsEpubExtract && epubArchiveFile ? epubArchiveFile.uri : null,
          sourceType: currentWebDavSource ? "webdav" : "local",
        });

        console.info("[mobile-reader] load:reader-input-ready", {
          calibreId,
          format: fmtUpper,
          archiveUri: localBookFile?.uri ?? webDavBookFile?.uri ?? epubArchiveFile?.uri ?? null,
          layoutMode: detailLayoutMode,
          renderer:
            detailLayoutMode === "reflowable"
              ? "readium-reflow"
              : fmtUpper === "PDF"
                ? "native-pdf"
                : fmtUpper === "PDF"
                  ? "native-pdf"
                  : "readium-fixed",
        });

        const archiveFile = needsPdfNativePath ? pdfLocalFile : (localBookFile ?? webDavBookFile);
        const bookArchiveFingerprint = archiveFile
          ? `${calibreId}-${fmtUpper}-${archiveFile.md5 ?? `sz${archiveFile.size ?? 0}`}`
          : epubArchiveFile
            ? `${calibreId}-${fmtUpper}-${epubArchiveFile.md5 ?? `sz${epubArchiveFile.size ?? 0}`}`
            : `${calibreId}-${fmtUpper}-nohash`;
        const bookArchiveOwned =
          Boolean(localBookFile) || Boolean(needsPdfNativePath && !currentWebDavSource && pdfLocalFile);

        const initialLocator = await getReadingProgress(lib, calibreId, fmt);
        if (cancelled) return;

        const initialPage =
          detailLayoutMode === "fixedLayout"
            ? pageIndexFromFixedLocator(initialLocator, INITIAL_READER_PAGE)
            : INITIAL_READER_PAGE;

        setLoadState({
          status: "ready",
          epubFileUri: needsEpubExtract && epubArchiveFile ? epubArchiveFile.uri : null,
          pdfLocalUri: needsPdfNativePath && pdfLocalFile ? pdfLocalFile.uri : null,
          bookArchiveUri: archiveFile?.uri ?? null,
          bookArchiveFingerprint,
          bookArchiveOwned,
          bookId: calibreId,
          format: fmt,
          title: detail.title,
          initialPage,
          initialLocator,
          layoutMode: detailLayoutMode,
        });

        console.info("[mobile-reader] load:ready", {
          calibreId,
          format: fmtUpper,
          title: detail.title,
          initialPage,
          initialLocator: initialLocator
            ? { href: initialLocator.href, type: initialLocator.type }
            : null,
          layoutMode: detailLayoutMode,
        });
      } catch (e) {
        if (cancelled) return;
        console.error("[mobile-reader] load:failed", {
          id,
          formatParam,
          libraryId: lib.id,
          error: e,
        });
        setLoadState({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, activeLibraryId, formatParam, maxCacheSizeMB]);

  return { loadState, coverUri, bookTitle };
}
