import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ensureLibraryMetadataCached,
  pickCalibreLibrary,
  readBooksFromLibrary,
} from "./calibre";
import { loadLibrariesConfig, saveLibrariesConfig } from "./library-storage";
import type { BookItem, DataSource, LocalDataSource, MobileLibrary, WebDavDataSource } from "./types";
import { readBooksFromWebDavLibrary } from "./webdav";

const BUILT_IN_LOCAL_SOURCE_ID = "device-local";

const BUILT_IN_LOCAL_SOURCE: LocalDataSource = {
  id: BUILT_IN_LOCAL_SOURCE_ID,
  type: "local",
  name: "手机",
  createdAt: 0,
};

function mergeDataSources(dataSources: DataSource[]) {
  const withoutBuiltIn = dataSources.filter((source) => source.id !== BUILT_IN_LOCAL_SOURCE_ID);
  return [BUILT_IN_LOCAL_SOURCE, ...withoutBuiltIn];
}

function persistableDataSources(dataSources: DataSource[]) {
  return dataSources.filter((source) => source.id !== BUILT_IN_LOCAL_SOURCE_ID);
}

type LibraryContextValue = {
  dataSources: DataSource[];
  libraries: MobileLibrary[];
  activeLibraryId: string | null;
  activeLibrary: MobileLibrary | null;
  books: BookItem[];
  loadingLibraries: boolean;
  loadingBooks: boolean;
  error: string | null;
  addLibrary: () => Promise<void>;
  addResolvedLibrary: (library: MobileLibrary) => Promise<void>;
  setActiveLibrary: (id: string) => Promise<void>;
  addDataSource: (dataSource: DataSource) => Promise<void>;
  removeDataSource: (id: string) => Promise<void>;
  refreshBooks: () => Promise<void>;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [dataSources, setDataSources] = useState<DataSource[]>([BUILT_IN_LOCAL_SOURCE]);
  const [libraries, setLibraries] = useState<MobileLibrary[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [loadingLibraries, setLoadingLibraries] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLibrary = useMemo(
    () => libraries.find((library) => library.id === activeLibraryId) ?? null,
    [libraries, activeLibraryId]
  );

  const persistConfig = useCallback(
    async (nextLibraries: MobileLibrary[], nextActiveLibraryId: string | null) => {
      await saveLibrariesConfig({
        dataSources: persistableDataSources(dataSources),
        libraries: nextLibraries,
        activeLibraryId: nextActiveLibraryId,
      });
    },
    [dataSources]
  );

  const persistAllConfig = useCallback(
    async (
      nextDataSources: DataSource[],
      nextLibraries: MobileLibrary[],
      nextActiveLibraryId: string | null
    ) => {
      await saveLibrariesConfig({
        dataSources: persistableDataSources(nextDataSources),
        libraries: nextLibraries,
        activeLibraryId: nextActiveLibraryId,
      });
    },
    []
  );

  const refreshBooks = useCallback(async () => {
    if (!activeLibrary) {
      setBooks([]);
      return;
    }

    setLoadingBooks(true);
    setError(null);

    try {
      const nextBooks =
        activeLibrary.sourceType === "webdav"
          ? await readBooksFromWebDavLibrary(
              activeLibrary,
              dataSources.find((item) => item.id === activeLibrary.dataSourceId && item.type === "webdav") as WebDavDataSource
            )
          : await readBooksFromLibrary(activeLibrary);
      setBooks(nextBooks);
    } catch (caught) {
      setBooks([]);
      setError(caught instanceof Error ? caught.message : "读取书库失败");
    } finally {
      setLoadingBooks(false);
    }
  }, [activeLibrary, dataSources]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const config = await loadLibrariesConfig();
        const nextLibraries = await Promise.all(
          config.libraries.map(async (library) => {
            try {
              return await ensureLibraryMetadataCached(library);
            } catch {
              return library;
            }
          })
        );
        const librariesChanged = nextLibraries.some(
          (library, index) => library.metadataUri !== config.libraries[index]?.metadataUri
        );

        if (!mounted) {
          return;
        }

        setLibraries(nextLibraries);
        setDataSources(mergeDataSources(config.dataSources));
        setActiveLibraryId(config.activeLibraryId ?? nextLibraries[0]?.id ?? null);

        if (librariesChanged) {
          await saveLibrariesConfig({
            dataSources: config.dataSources,
            libraries: nextLibraries,
            activeLibraryId: config.activeLibraryId ?? nextLibraries[0]?.id ?? null,
          });
        }
      } catch (caught) {
        if (mounted) {
          setDataSources([BUILT_IN_LOCAL_SOURCE]);
          setError(caught instanceof Error ? caught.message : "加载书库失败");
        }
      } finally {
        if (mounted) {
          setLoadingLibraries(false);
        }
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void refreshBooks();
  }, [refreshBooks]);

  const addLibrary = useCallback(async () => {
    setError(null);

    try {
      const picked = await pickCalibreLibrary();

      if (
        libraries.some(
          (item) => item.metadataUri === picked.metadataUri || item.path === picked.path
        )
      ) {
        throw new Error("该书库已经添加过了");
      }

      const nextLibrary = {
        ...picked,
        dataSourceId: BUILT_IN_LOCAL_SOURCE_ID,
        sourceType: "local" as const,
      };

      const nextLibraries = [...libraries, nextLibrary];
      const nextActiveLibraryId = activeLibraryId ?? picked.id;

      setLibraries(nextLibraries);
      setActiveLibraryId(nextActiveLibraryId);
      await persistConfig(nextLibraries, nextActiveLibraryId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "添加书库失败");
      throw caught;
    }
  }, [activeLibraryId, libraries, persistConfig]);

  const addResolvedLibrary = useCallback(
    async (library: MobileLibrary) => {
      if (
        libraries.some(
          (item) => item.metadataUri === library.metadataUri || item.path === library.path
        )
      ) {
        throw new Error("该书库已经添加过了");
      }

      const nextLibraries = [...libraries, library];
      const nextActiveLibraryId = activeLibraryId ?? library.id;

      setLibraries(nextLibraries);
      setActiveLibraryId(nextActiveLibraryId);
      await persistAllConfig(dataSources, nextLibraries, nextActiveLibraryId);
    },
    [activeLibraryId, dataSources, libraries, persistAllConfig]
  );

  const addDataSource = useCallback(
    async (dataSource: DataSource) => {
      const nextDataSources = mergeDataSources([...persistableDataSources(dataSources), dataSource]);
      setDataSources(nextDataSources);
      await persistAllConfig(nextDataSources, libraries, activeLibraryId);
    },
    [activeLibraryId, dataSources, libraries, persistAllConfig]
  );

  const removeDataSource = useCallback(
    async (id: string) => {
      if (id === BUILT_IN_LOCAL_SOURCE_ID) {
        throw new Error("内置手机数据源不能删除");
      }

      if (libraries.some((library) => library.dataSourceId === id)) {
        throw new Error("请先移除使用该数据源的书库");
      }

      const nextDataSources = mergeDataSources(
        persistableDataSources(dataSources).filter((source) => source.id !== id)
      );

      setDataSources(nextDataSources);
      await persistAllConfig(nextDataSources, libraries, activeLibraryId);
    },
    [activeLibraryId, dataSources, libraries, persistAllConfig]
  );

  const setActiveLibrary = useCallback(
    async (id: string) => {
      setActiveLibraryId(id);
      await persistConfig(libraries, id);
    },
    [libraries, persistConfig]
  );

  const value = useMemo<LibraryContextValue>(
    () => ({
      dataSources,
      libraries,
      activeLibraryId,
      activeLibrary,
      books,
      loadingLibraries,
      loadingBooks,
      error,
      addLibrary,
      addResolvedLibrary,
      setActiveLibrary,
      addDataSource,
      removeDataSource,
      refreshBooks,
    }),
    [
      dataSources,
      libraries,
      activeLibraryId,
      activeLibrary,
      books,
      loadingLibraries,
      loadingBooks,
      error,
      addLibrary,
      addResolvedLibrary,
      setActiveLibrary,
      addDataSource,
      removeDataSource,
      refreshBooks,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibraries() {
  const context = useContext(LibraryContext);

  if (!context) {
    throw new Error("useLibraries must be used within LibraryProvider");
  }

  return context;
}
