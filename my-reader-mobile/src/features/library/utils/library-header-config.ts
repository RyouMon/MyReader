import type { LibraryFilterOption, SortOption } from "@/src/features/library/hooks/use-book-filter";
import type { LibraryViewMode } from "@/src/store/app-store.types";

export const libraryFilterOptions = [
  { value: "all", labelKey: "library.filter.all" as const },
  { value: "favorites", labelKey: "library.filter.favorites" as const },
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

export const libraryFilterTitleOptions = [
  { value: "all", labelKey: "library.filterTitle.all" as const },
  { value: "downloaded", labelKey: "library.filterTitle.downloaded" as const },
  { value: "notDownloaded", labelKey: "library.filterTitle.notDownloaded" as const },
  { value: "downloading", labelKey: "library.filterTitle.downloading" as const },
  { value: "favorites", labelKey: "library.filterTitle.favorites" as const },
] as const;

/** Returns the display label for the active library filter. */
export function getLibraryFilterLabel(t: (key: string) => string, option: LibraryFilterOption) {
  const item = libraryFilterOptions.find((entry) => entry.value === option);
  return item ? t(item.labelKey) : t("library.filter.all");
}

/** Returns the header title for the active library filter. */
export function getLibraryFilterTitle(t: (key: string) => string, option: LibraryFilterOption) {
  const item = libraryFilterTitleOptions.find((entry) => entry.value === option);
  return item ? t(item.labelKey) : t("library.filterTitle.all");
}
