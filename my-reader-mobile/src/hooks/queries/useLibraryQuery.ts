import i18n from "@/src/i18n";

import { useQuery } from "@tanstack/react-query";

import { readBooksFromLibrary } from "@/src/data/calibre";
import { readBooks } from "@/src/data/webdav";
import { readBooks as readOneDriveBooks } from "@/src/data/onedrive";
import { getValidAccessToken } from "@/src/data/onedrive-auth";
import type { BookItem, DataSource, Library, OneDriveDataSource, WebDavDataSource } from "@/src/data/types";
import { isRemoteSourceType } from "@/src/data/types";
import { useAppStore } from "@/src/store/app-store";
import { readWebDavPassword } from "@/src/store/secure-credential-store";

export const libraryQueryKeys = {
  books: (libraryId: string | null) => ["books", libraryId] as const,
};

export async function fetchBooksWithMeta(
  activeLibrary: Library,
  dataSources: DataSource[]
): Promise<{ books: BookItem[]; metadataUri?: string }> {
  if (activeLibrary.sourceType === "webdav") {
    const source = dataSources.find(
      (item) => item.id === activeLibrary.dataSourceId && item.type === "webdav"
    );
    if (!source || source.type !== "webdav") {
      throw new Error(i18n.t("sync.webdavSourceNotFound"));
    }

    const password = source.password ?? (await readWebDavPassword(source.id)) ?? "";
    if (!password) {
      throw new Error(i18n.t("sync.webdavPasswordMissing"));
    }

    const { books, metadataUri } = await readBooks(activeLibrary, {
      ...source,
      password,
    } as WebDavDataSource);
    return { books, metadataUri };
  }

  if (activeLibrary.sourceType === "onedrive") {
    const rawSource = dataSources.find(
      (item) => item.id === activeLibrary.dataSourceId && item.type === "onedrive"
    );
    if (!rawSource || rawSource.type !== "onedrive") {
      throw new Error(i18n.t("sync.onedriveSourceNotFound"));
    }
    const accessToken = await getValidAccessToken(rawSource.id);
    const oneDriveSource: OneDriveDataSource = { ...rawSource, accessToken };
    const { books, metadataUri } = await readOneDriveBooks(activeLibrary, oneDriveSource);
    return { books, metadataUri };
  }

  const books = await readBooksFromLibrary(activeLibrary);
  return { books, metadataUri: activeLibrary.metadataUri };
}

export async function fetchBooks(
  activeLibrary: Library,
  dataSources: DataSource[]
): Promise<BookItem[]> {
  const { books } = await fetchBooksWithMeta(activeLibrary, dataSources);
  return books;
}

export function useBooks(activeLibraryId: string | null) {
  return useQuery({
    queryKey: libraryQueryKeys.books(activeLibraryId),
    queryFn: async () => {
      if (!activeLibraryId) return [];

      const state = useAppStore.getState();
      const activeLibrary =
        state.libraries.find((library) => library.id === activeLibraryId) ?? null;

      if (!activeLibrary) return [];

      return fetchBooks(activeLibrary, state.dataSources);
    },
    enabled: !!activeLibraryId,
    staleTime: 1000 * 60 * 5,
  });
}
