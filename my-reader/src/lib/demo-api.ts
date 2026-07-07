import type {
  BookDetail,
  BookEntry,
  BookFileStateDto,
  CacheUsageDto,
  DataSourceDto,
  DbSyncReport,
  FileStateDto,
  FileStateRequestDto,
  LibraryInfo,
  OnedriveAuthResultDto,
  OnedriveFolderEntry,
  PaginatedBooks,
  PreparedBookSource,
  ReaderUiPreferences_Serialize,
  ReadingProgressDto,
  WebdavFolderEntry,
} from "./tauri-specta"

type OkResult<T> = Promise<{ status: "ok"; data: T }>

const DEMO_LIBRARY_ID = "demo-library"
const DEMO_SOURCE_ID = "demo-source"
const DEMO_NOW = "2026-07-03T08:00:00.000Z"

const demoLibrary: LibraryInfo = {
  id: DEMO_LIBRARY_ID,
  name: "Demo Library",
  path: "C:/Demo/Library",
  bookCount: 6,
  sourceType: "webdav",
  dataSourceId: DEMO_SOURCE_ID,
  sourcePath: "/books",
}

const demoBooks: BookEntry[] = [
  {
    id: 1,
    title: "夜航书店与失眠地图",
    authorSort: "Shen Yao",
    authors: ["沈遥", "林知微"],
    tags: ["小说", "城市奇幻", "已购"],
    series: "MyReader Demo",
    seriesIndex: 1,
    formats: ["EPUB", "PDF"],
    hasCover: false,
    path: "Night Bookstore/Night Bookstore.epub",
    timestamp: DEMO_NOW,
    pubdate: "2026-07-03T00:00:00.000Z",
    lastModified: DEMO_NOW,
    comment:
      "一间只在雨夜营业的旧书店，保存着城市里每个失眠者遗失的梦。年轻的档案修复师在整理一批匿名手稿时，发现书页边缘标注着不存在的街道和未来发生的告别。她循着这些线索穿过凌晨的电车站、废弃影院和海边灯塔，慢慢拼出一张关于记忆、选择与重逢的地图。",
    publisher: "MyReader Lab",
    languages: ["zh"],
    rating: 8,
    uuid: "demo-book-0001",
  },
  {
    id: 2,
    title: "玻璃港的星期三",
    authorSort: "Qiao Nan",
    authors: ["乔南"],
    tags: ["散文", "旅行"],
    series: null,
    seriesIndex: null,
    formats: ["EPUB"],
    hasCover: false,
    path: "Glass Harbor/Wednesday.epub",
    timestamp: DEMO_NOW,
    pubdate: "2025-11-12T00:00:00.000Z",
    lastModified: DEMO_NOW,
    comment: "关于海港、旧照片和一段被重新整理的生活。",
    publisher: "南岸出版社",
    languages: ["zh"],
    rating: 7,
    uuid: "demo-book-0002",
  },
  {
    id: 3,
    title: "阅读器设计札记",
    authorSort: "MyReader Team",
    authors: ["MyReader Team"],
    tags: ["设计", "产品"],
    series: "MyReader Demo",
    seriesIndex: 2,
    formats: ["EPUB", "AZW3"],
    hasCover: false,
    path: "Design Notes/Reader UI.epub",
    timestamp: DEMO_NOW,
    pubdate: "2026-01-20T00:00:00.000Z",
    lastModified: DEMO_NOW,
    comment: null,
    publisher: "MyReader Lab",
    languages: ["zh"],
    rating: null,
    uuid: "demo-book-0003",
  },
  {
    id: 4,
    title: "纸上银河修复指南",
    authorSort: "Chen Mian",
    authors: ["陈眠"],
    tags: ["科幻", "短篇集"],
    series: null,
    seriesIndex: null,
    formats: ["PDF"],
    hasCover: false,
    path: "Paper Galaxy/Guide.pdf",
    timestamp: DEMO_NOW,
    pubdate: "2024-09-21T00:00:00.000Z",
    lastModified: DEMO_NOW,
    comment: "十七个关于纸、星图和旧机器的短篇故事。",
    publisher: "北桥文化",
    languages: ["zh"],
    rating: 9,
    uuid: "demo-book-0004",
  },
  {
    id: 5,
    title: "午后三点的索引卡",
    authorSort: "Xu Yuan",
    authors: ["许原"],
    tags: ["推理", "档案"],
    series: "档案室事件簿",
    seriesIndex: 1,
    formats: ["EPUB"],
    hasCover: false,
    path: "Index Cards/3PM.epub",
    timestamp: DEMO_NOW,
    pubdate: "2023-05-18T00:00:00.000Z",
    lastModified: DEMO_NOW,
    comment: "一张被误归档的索引卡，牵出二十年前图书馆闭馆后的秘密。",
    publisher: "页间社",
    languages: ["zh"],
    rating: 6,
    uuid: "demo-book-0005",
  },
  {
    id: 6,
    title: "给雨季的十二封信",
    authorSort: "Luo Qing",
    authors: ["罗晴"],
    tags: ["书信", "文学"],
    series: null,
    seriesIndex: null,
    formats: ["EPUB", "PDF", "MOBI"],
    hasCover: false,
    path: "Rain Letters/Twelve Letters.epub",
    timestamp: DEMO_NOW,
    pubdate: "2022-08-09T00:00:00.000Z",
    lastModified: DEMO_NOW,
    comment: "无。",
    publisher: "风灯书局",
    languages: ["zh"],
    rating: 8,
    uuid: "demo-book-0006",
  },
]

const formatSizes = {
  EPUB: 2_097_152,
  PDF: 4_096_000,
  AZW3: 3_145_728,
  MOBI: 2_621_440,
} as const

let activeLibraryId = DEMO_LIBRARY_ID
let favoriteBookIds = new Set([1, 4])
let readingFormats: Record<string, string> = {
  "1": "EPUB",
  "3": "EPUB",
}

const demoProgressRows: ReadingProgressDto[] = [
  {
    libraryId: DEMO_LIBRARY_ID,
    bookId: 1,
    format: "EPUB",
    locator: { locations: { progression: 0.42 } },
    updatedAt: Date.now(),
  },
  {
    libraryId: DEMO_LIBRARY_ID,
    bookId: 3,
    format: "EPUB",
    locator: { locations: { progression: 0.18 } },
    updatedAt: Date.now(),
  },
]

const readerPreferences: ReaderUiPreferences_Serialize = {
  version: 4,
  appTheme: "system",
  libraryViewMode: "grid",
  detailFullScreen: false,
  fixedLayout: {},
  reflowable: {
    settings: {
      theme: "default",
      fontFamily: "system",
      fontSize: 18,
      lineHeight: 1.6,
      paddingX: 16,
      readingLayout: "paginated",
      textAlign: "justify",
      colCount: "auto",
    },
    tts: {
      ttsConfigId: "default",
      ttsSpeed: 1,
    },
  },
  cache: {
    maxCacheSizeMb: 2048,
    autoCleanupOnLaunch: true,
  },
}

export function isDemoApiEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false
  if ("__TAURI_INTERNALS__" in window) return false

  const params = new URLSearchParams(window.location.search)
  const enabledByUrl =
    params.get("demo") === "1" || params.get("myreader-demo") === "1"
  if (enabledByUrl) {
    window.localStorage.setItem("myreader-demo-mode", "1")
    return true
  }
  return window.localStorage.getItem("myreader-demo-mode") === "1"
}

function ok<T>(data: T): OkResult<T> {
  return Promise.resolve({ status: "ok", data })
}

function demoBookDetail(bookId: number): BookDetail {
  const book = demoBooks.find((item) => item.id === bookId) ?? demoBooks[0]
  return {
    ...book,
    formatSizes: book.formats.map((format) => ({
      format,
      sizeBytes: formatSizes[format as keyof typeof formatSizes] ?? 1_048_576,
    })),
    identifiers: [
      { idType: "ISBN", value: `97800000000${book.id}` },
      { idType: "uuid", value: book.uuid ?? `demo-book-${book.id}` },
    ],
  }
}

function filteredBooks(sortBy: string | null, search: string | null) {
  const query = search?.trim().toLocaleLowerCase()
  let rows = demoBooks
  if (query) {
    rows = rows.filter((book) =>
      [book.title, ...book.authors, ...book.tags, book.publisher ?? ""].some(
        (value) => value.toLocaleLowerCase().includes(query),
      ),
    )
  }
  if (sortBy === "title") {
    return [...rows].sort((a, b) => a.title.localeCompare(b.title, "zh"))
  }
  return rows
}

function cachedFileState(bookId: number, format: string): FileStateDto {
  const upperFormat = format.toUpperCase()
  return {
    path: `C:/Demo/cache/${bookId}.${upperFormat.toLocaleLowerCase()}`,
    localState: "cached",
    localSize:
      formatSizes[upperFormat as keyof typeof formatSizes] ?? 1_048_576,
  }
}

export const demoCommands = {
  listLibraries: () => ok<LibraryInfo[]>([demoLibrary]),
  listDataSources: () =>
    ok<DataSourceDto[]>([
      {
        id: DEMO_SOURCE_ID,
        name: "Demo WebDAV",
        enabled: true,
        kind: "webdav",
        endpoint: "https://demo.example.invalid",
        username: "demo",
        has_password: true,
        root_path: "/books",
      },
    ]),
  testWebdavConnection: () => ok<null>(null),
  addLibrary: () => ok<LibraryInfo>(demoLibrary),
  addWebdavLibrary: () => ok<LibraryInfo>(demoLibrary),
  addOnedriveLibrary: () => ok<LibraryInfo>(demoLibrary),
  refreshLibrary: () => ok<LibraryInfo>(demoLibrary),
  refreshWebdavLibrary: () => ok<LibraryInfo>(demoLibrary),
  refreshOnedriveLibrary: () => ok<LibraryInfo>(demoLibrary),
  addLocalDataSource: () =>
    ok<DataSourceDto>({
      id: "demo-local-source",
      name: "Demo Local",
      enabled: true,
      kind: "local",
      root_path: "C:/Demo",
    }),
  addWebdavDataSource: () =>
    ok<DataSourceDto>({
      id: DEMO_SOURCE_ID,
      name: "Demo WebDAV",
      enabled: true,
      kind: "webdav",
      endpoint: "https://demo.example.invalid",
      username: "demo",
      has_password: true,
      root_path: "/books",
    }),
  addOnedriveDataSource: () =>
    ok<DataSourceDto>({
      id: "demo-onedrive-source",
      name: "Demo OneDrive",
      enabled: true,
      kind: "onedrive",
      client_id: "",
      tenant_id: "",
      has_refresh_token: true,
      root_path: "/books",
      user_name: "Demo",
      user_email: "demo@example.invalid",
    }),
  removeLibrary: () => ok<null>(null),
  removeDataSource: () => ok<null>(null),
  switchLibrary: (id: string) => {
    activeLibraryId = id
    return ok<null>(null)
  },
  getActiveLibraryId: () => ok<string | null>(activeLibraryId),
  webdavListFolders: (_dataSourceId: string, path: string) =>
    ok<WebdavFolderEntry[]>([
      { name: "Books", path: `${path.replace(/\/$/, "")}/Books` },
    ]),
  onedriveStartAuth: () =>
    ok<OnedriveAuthResultDto>({
      accessToken: "demo-access-token",
      refreshToken: "demo-refresh-token",
      userName: "Demo",
      userEmail: "demo@example.invalid",
    }),
  onedriveListFolders: (_dataSourceId: string, path: string) =>
    ok<OnedriveFolderEntry[]>([
      {
        name: "Books",
        path: `${path.replace(/\/$/, "")}/Books`,
        itemId: "demo-folder",
      },
    ]),
  getBooks: () => ok<BookEntry[]>(demoBooks),
  getBooksPage: (
    _libraryId: string | null,
    offset: number,
    limit: number,
    sortBy: string | null,
    search: string | null,
  ) => {
    const rows = filteredBooks(sortBy, search)
    return ok<PaginatedBooks>({
      items: rows.slice(offset, offset + limit),
      total: rows.length,
    })
  },
  getBookDetail: (_libraryId: string | null, bookId: number) =>
    ok<BookDetail>(demoBookDetail(bookId)),
  getSeriesBooks: (
    _libraryId: string | null,
    seriesName: string,
    excludeBookId: number | null,
  ) =>
    ok<BookEntry[]>(
      demoBooks.filter(
        (book) => book.series === seriesName && book.id !== excludeBookId,
      ),
    ),
  listBookReadingFormats: () => ok<Record<string, string>>(readingFormats),
  setBookReadingFormat: (
    _libraryId: string,
    bookId: number,
    format: string | null,
  ) => {
    readingFormats = {
      ...readingFormats,
      [String(bookId)]: format ?? "",
    }
    return ok<null>(null)
  },
  listFavoriteBookIds: () => ok<number[]>([...favoriteBookIds]),
  addFavoriteBook: (_libraryId: string | null, bookId: number) => {
    favoriteBookIds = new Set([...favoriteBookIds, bookId])
    return ok<null>(null)
  },
  removeFavoriteBook: (_libraryId: string | null, bookId: number) => {
    favoriteBookIds = new Set(
      [...favoriteBookIds].filter((item) => item !== bookId),
    )
    return ok<null>(null)
  },
  getReadingProgress: (
    _libraryId: string | null,
    bookId: number,
    format: string,
  ) =>
    ok<ReadingProgressDto | null>(
      demoProgressRows.find(
        (row) => row.bookId === bookId && row.format === format,
      ) ?? null,
    ),
  listReadingProgress: () => ok<ReadingProgressDto[]>(demoProgressRows),
  setReadingProgress: () => ok<null>(null),
  getReaderUiPreferences: () =>
    ok<ReaderUiPreferences_Serialize>(readerPreferences),
  setReaderUiPreferences: () => ok<null>(null),
  prepareBookSource: (
    _libraryId: string | null,
    _bookId: number,
    format: string,
  ) =>
    ok<PreparedBookSource>({
      format,
      filePath: `C:/Demo/book.${format.toLocaleLowerCase()}`,
      extractedDirPath: null,
      extractedEntries: [],
      streamerUrl: null,
    }),
  writeEpubReadiumManifest: () => ok<null>(null),
  closeBookStreamer: () => ok<null>(null),
  getCacheUsage: () =>
    ok<CacheUsageDto>({ totalBytes: 12_582_912, maxBytes: 2_147_483_648 }),
  clearCache: () => ok<null>(null),
  enforceCacheLimit: () => ok<null>(null),
  syncDbForLibrary: () => ok<DbSyncReport>({ pushed: 0, pulled: 0 }),
  checkBookFileState: (_libraryId: string, bookId: number, format: string) =>
    ok<FileStateDto>(cachedFileState(bookId, format)),
  checkBookFileStates: (_libraryId: string, requests: FileStateRequestDto[]) =>
    ok<BookFileStateDto[]>(
      requests.map((request) => ({
        bookId: request.bookId,
        format: request.format.toUpperCase(),
        ...cachedFileState(request.bookId, request.format),
      })),
    ),
  downloadBookFile: (_libraryId: string, bookId: number, format: string) =>
    ok<string>(`C:/Demo/cache/${bookId}.${format.toLocaleLowerCase()}`),
  deleteLocalBookFile: () => ok<null>(null),
  cancelBookDownload: () => ok<boolean>(true),
}
