import type { MenuAction } from "@react-native-menu/menu";

import i18n from "@/src/i18n";

import type { BookDownloadStatus } from "@/src/features/library/components/books/book-cover";

import { getReadableFormats, resolveEffectiveFormat } from "@/src/data/book-formats";

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
  const actions: MenuAction[] = [{ id: "detail", title: i18n.t("bookMenu.detail") }];

  if (isWebdav && downloadStatus !== "downloaded") {
    if (readableFormats.length === 1) {
      actions.push({
        id: `download:${readableFormats[0]}`,
        title: i18n.t("bookMenu.downloadFormat", { format: readableFormats[0] }),
      });
    } else if (readableFormats.length > 1) {
      actions.push({
        id: "download",
        title: i18n.t("bookMenu.download"),
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
      title: i18n.t("bookMenu.defaultFormat", { format: effectiveFormat ?? "-" }),
      subactions: readableFormats.map((fmt) => ({
        id: `setDefaultFormat:${fmt}`,
        title: `${effectiveFormat === fmt ? "✓ " : ""}${fmt}`,
      })),
    });
  }

  if (isWebdav && downloadStatus === "downloaded") {
    actions.push({
      id: "deleteDownload",
      title: i18n.t("bookMenu.deleteDownload"),
      attributes: { destructive: true },
    });
  }

  return actions;
}