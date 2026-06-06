import type { DownloadFilterOption, SortOption } from "@/src/hooks/use-library-book-search";
import type { LibraryViewMode } from "@/src/store/app-store.types";

export const libraryDownloadFilterOptions = [
  { value: "all", labelKey: "library.filter.all" as const },
  { value: "downloaded", labelKey: "library.filter.downloaded" as const },
  { value: "notDownloaded", labelKey: "library.filter.notDownloaded" as const },
  { value: "downloading", labelKey: "library.filter.downloading" as const },
] as const;

export const librarySortOptions: { value: SortOption; labelKey: string }[] = [
  { value: "title", labelKey: "library.sort.title" },
  { value: "author", labelKey: "library.sort.author" },
  { value: "recentlyAdded", labelKey: "library.sort.recentlyAdded" },
];

export const libraryViewOptions: { value: LibraryViewMode; labelKey: string }[] = [
  { value: "grid", labelKey: "library.view.grid" },
  { value: "list", labelKey: "library.view.list" },
];

/** Returns the display label for the active download-state filter. */
export function getLibraryDownloadFilterLabel(t: (key: string) => string, option: DownloadFilterOption) {
  const item = libraryDownloadFilterOptions.find((entry) => entry.value === option);
  return item ? t(item.labelKey) : t("library.filter.all");
}
