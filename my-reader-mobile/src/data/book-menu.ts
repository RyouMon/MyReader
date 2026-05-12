import type { MenuAction } from "@react-native-menu/menu";

import type { BookDownloadStatus } from "@/src/features/library/components/books/book-cover";

import { getReadableFormats, resolveEffectiveFormat } from "./book-formats";

export type BookMenuConfig = {
  isWebdav: boolean;
  formats?: string[];
  selectedFormat?: string;
};

/**
 * Builds the per-book menu actions from primitive inputs so cells can recompute
 * only when their own inputs change.
 */
export function buildBookMenuActions(
  downloadStatus: BookDownloadStatus | undefined,
  menuConfig: BookMenuConfig,
): MenuAction[] {
  const { isWebdav, formats, selectedFormat } = menuConfig;
  const readableFormats = getReadableFormats(formats);
  const effectiveFormat = resolveEffectiveFormat(readableFormats, selectedFormat);
  const actions: MenuAction[] = [{ id: "detail", title: "图书详情" }];

  if (isWebdav && downloadStatus !== "downloaded") {
    if (readableFormats.length === 1) {
      actions.push({
        id: `download:${readableFormats[0]}`,
        title: `下载（${readableFormats[0]}）`,
      });
    } else if (readableFormats.length > 1) {
      actions.push({
        id: "download",
        title: "下载",
        subactions: readableFormats.map((fmt) => ({
          id: `download:${fmt}`,
          title: fmt,
        })),
      });
    }
  }

  if (readableFormats.length > 1) {
    actions.push({
      id: "setDefaultFormat",
      title: `默认阅读格式：${effectiveFormat ?? "-"}`,
      subactions: readableFormats.map((fmt) => ({
        id: `setDefaultFormat:${fmt}`,
        title: `${effectiveFormat === fmt ? "✓ " : ""}${fmt}`,
      })),
    });
  }

  if (isWebdav && downloadStatus === "downloaded") {
    actions.push({
      id: "deleteDownload",
      title: "删除下载文件",
      attributes: { destructive: true },
    });
  }

  return actions;
}
