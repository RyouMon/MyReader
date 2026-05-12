import { useQuery } from "@tanstack/react-query";

import { readBooksFromLibrary } from "@/src/data/calibre";
import { readBooksFromWebDavLibrary } from "@/src/data/webdav";
import type { BookItem, DataSource, Library, WebDavDataSource } from "@/src/data/types";
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
      throw new Error("当前书库关联的 WebDAV 数据源不存在。");
    }

    const password = source.password ?? (await readWebDavPassword(source.id)) ?? "";
    if (!password) {
      throw new Error("当前 WebDAV 数据源缺少密码，请重新编辑数据源。");
    }

    const { books, metadataUri } = await readBooksFromWebDavLibrary(activeLibrary, {
      ...source,
      password,
    } as WebDavDataSource);
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
