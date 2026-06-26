import { File } from "expo-file-system";
import { shareAsync } from "expo-sharing";

import { getBookFormatPaths } from "./calibre";
import { isRemoteSourceType } from "../types";
import type { Library } from "../types";
import { getFileState } from "../sync/actions";
import { fileHasNonEmptyBytes } from "@/src/services/fs/file-io";
import { libraryBookFileUri } from "@/src/services/fs/library-paths";

export type ShareableFormat = {
  format: string;
  relativePath: string;
  fileUri: string;
  isLocal: boolean;
};

/**
 * Resolves a single book format and whether it exists locally enough to share.
 * Returns null when the requested format cannot be found in Calibre metadata.
 */
export async function resolveShareableFormat(
  library: Library,
  calibreBookId: number,
  format: string,
): Promise<ShareableFormat | null> {
  const formatPaths = await getBookFormatPaths(library, calibreBookId);
  const match = formatPaths.find((item) => item.format.toUpperCase() === format.toUpperCase());
  if (!match) {
    return null;
  }

  const fileUri = libraryBookFileUri(library, match.relativePath);
  let isLocal = false;

  if (isRemoteSourceType(library.sourceType)) {
    const fileState = await getFileState(library, match.relativePath);
    const isDownloaded =
      fileState?.localState === "present" ||
      fileState?.localState === "local_only" ||
      fileState?.localState === "dirty_push";
    isLocal = isDownloaded && fileHasNonEmptyBytes(fileUri);
  } else {
    const file = new File(fileUri);
    isLocal = file.exists && (file.size ?? 0) > 0;
  }

  return {
    format: match.format,
    relativePath: match.relativePath,
    fileUri,
    isLocal,
  };
}

function mimeTypeForFormat(format: string): string {
  switch (format.toUpperCase()) {
    case "EPUB":
      return "application/epub+zip";
    case "PDF":
      return "application/pdf";
    case "CBZ":
      return "application/x-cbz";
    default:
      return "application/octet-stream";
  }
}

function utiForFormat(format: string): string {
  switch (format.toUpperCase()) {
    case "EPUB":
      return "org.idpf.epub-container";
    case "PDF":
      return "com.adobe.pdf";
    default:
      return "public.data";
  }
}

/**
 * Shares a local book file URI through the system share sheet.
 */
export async function shareBookFile(fileUri: string, format: string): Promise<void> {
  await shareAsync(fileUri, {
    UTI: utiForFormat(format),
    mimeType: mimeTypeForFormat(format),
  });
}
