export const sharedEn = {
  qwenTts: {
    title: "Qwen",
    add: "Add {{name}}",
    description: "Use credentials for this endpoint and choose your voice.",
    sources: {
      tokenPlan: {
        title: "Qwen · Token Plan",
        description:
          "Use your Qwen subscription credits and plan-specific key.",
        credential: "Token Plan subscription key (starts with sk-sp-)",
      },
      qianwen: {
        title: "Qwen · Pay as you go",
        description:
          "Use the Qianwen AI Platform API with usage-based billing.",
        credential: "Qianwen AI Platform API key (not a subscription key)",
      },
      dashscope: {
        title: "Qwen · DashScope (Model Studio)",
        description:
          "Use Alibaba Cloud Model Studio, Beijing region by default.",
        credential: "Alibaba Cloud Model Studio API key for this region",
      },
    },
    manualVoicesAction: "Enter voice IDs manually",
    manualVoices: "Voice IDs",
    manualVoicesHint:
      "For official or custom voices missing from the list. Enter one ID per line.",
    loadingVoices: "Loading account voices…",
    voicesFailed:
      "Could not load account voices. Saved voices and manually entered IDs are still available.",
    voicesEmpty:
      "No account voices for this model. Create a voice on the corresponding platform or enter an existing voice ID.",
    credentialRequired:
      "API key matching this endpoint; Token Plan requires an sk-sp- subscription key",
  },
  addLibraryFlow: {
    title: "Add library",
    noLibrary: {
      title: "No library added yet",
      description: "Create a new library or open an existing one.",
    },
    create: {
      title: "Create new library",
      description: "Create a MyReader library",
    },
    open: {
      title: "Open existing library",
      description: "Open an existing MyReader or Calibre library.",
    },
    help: {
      label: "About libraries",
      myreader: {
        title: "What is a MyReader library?",
        body: "Created and managed by MyReader. You can import and delete books, and edit titles and authors.",
      },
      calibre: {
        title: "What is a Calibre library?",
        body: "Created and managed by Calibre. MyReader opens it read-only and does not modify its books or metadata.",
      },
      sync: {
        title: "About reading data sync",
        body: "Both library types support syncing reading data across devices. Store the library in cloud storage, then open the same library from each device.",
      },
      choice: {
        title: "Which should I choose?",
        body: 'If you previously used Calibre to manage your library, we recommend choosing "Open existing library"; otherwise, choose "Create new library".',
      },
    },
    storageLocations: "Available locations",
    addStorage: "Add data source",
    addWebdav: {
      title: "Add WebDAV",
      description: "Enter the server address and account details.",
    },
    addOnedrive: {
      title: "Add OneDrive",
      description: "Sign in with a Microsoft account.",
    },
  },
  bookDetail: {
    backToLibrary: "Back to library",
    collapse: "Collapse",
    favorite: "Favorite",
    libraryUnavailable: {
      title: "Current library unavailable",
      detail: "It may have been removed. Return to the library.",
    },
    loadFailed: {
      title: "Unable to load book details",
      detail:
        "An error occurred while reading the book information. Try again.",
    },
    notFound: {
      title: "Book not found",
      detail: "It may have been removed from the current library.",
    },
    readingProgress: "Reading progress",
    retry: "Retry",
    synopsis: "Synopsis",
  },
  bookRow: {
    unread: "Unread",
  },
  common: {
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    save: "Save",
  },
  library: {
    browseAllBooks: "Browse all books",
    importBook: "Import book",
    label: "Library",
    collections: {
      transferSection: "Transfers",
      storageSection: "Storage and sync",
      all: "All books",
      recentlyRead: "Recently read",
      favorites: "Favorites",
      downloaded: "Downloaded",
      downloading: "Downloading",
      uploading: "Uploading",
      localOnly: "Local only",
      bookCount: "{{count}} books",
    },
    noMatch: {
      search: {
        title: "No search results",
        detail: "No books match your search. Try different keywords.",
      },
      empty: {
        title: "Library is empty",
        myreaderDetail: "Import a book to get started.",
        calibreDetail: "Add books to this library using Calibre.",
      },
      favorites: {
        title: "No favorites yet",
        detail: "Add a book to your favorites.",
      },
      recentlyRead: {
        title: "No reading history yet",
        detail: "Open a book to start reading.",
      },
      downloaded: {
        title: "No downloaded books yet",
        detail: "Download a book for offline reading.",
      },
      downloading: {
        title: "No download tasks",
        detail: "Start downloading a book from your library.",
      },
      uploading: {
        title: "No upload tasks",
        detail: "Upload a book that is stored only on this device.",
      },
      localOnly: {
        title: "No local-only books",
        detail: "No action is needed. There are no books waiting to upload.",
      },
    },
    sort: {
      author: "Author",
      title: "Title",
    },
  },
  reader: {
    background: "Background",
    empty: {
      annotations: {
        title: "No highlights or notes yet",
        detail: "Select text first, then add a highlight or note.",
      },
      bookmarks: {
        title: "No bookmarks yet",
        detail: "Add a bookmark while reading.",
      },
    },
    fontOptions: {
      default: "Default",
      maru975Sc: "Alimama FangYuanTi",
      monospace: "Monospace",
      notoSansSc: "Noto Sans SC",
      notoSerifSc: "Noto Serif SC",
      sans: "Sans",
      serif: "Serif",
    },
    navigation: "Contents",
    themes: {
      green: "Green",
      neutral: "White",
      night: "Night",
      ocean: "Ocean",
      paper: "Paper",
      sepia: "Sepia",
    },
  },
  settings: {
    title: "Settings",
  },
  syncStatus: {
    title: "Sync status",
    details: "Sync details",
    accessibilityLabel: "Sync status: {{status}}",
    currentLibrary: "Current library",
    currentStatus: "Current status",
    currentStage: "Current stage",
    currentReason: "Sync reason",
    lastReason: "Last sync reason",
    lastSync: "Last synced",
    lastAttempt: "Last attempt",
    noHistory: "No sync history",
    failureReason: "Failure reason",
    failureStage: "Failure stage",
    progress: "{{completed}} / {{total}}",
    manualSync: "Sync now",
    syncingAction: "Syncing",
    waitingForNetwork: "Waiting for network",
    offlineDetail:
      "This library's transport requires a network connection. Sync can continue after connectivity returns.",
    noActiveLibrary: "No library to sync",
    noActiveLibraryDetail: "Add a library to start syncing.",
    activeLibraryChanged: "The current library changed. Please try again.",
    failure: {
      connectivity: {
        title: "Unable to connect",
        detail:
          "Check your network connection and whether the data source is available, then try syncing again.",
      },
      credential: {
        title: "Check data source access",
        detail:
          "Sign in again or update the data source credentials, and check that this account can access the library.",
      },
      configuration: {
        title: "Check library settings",
        detail:
          "Check the library location and data source settings, then try syncing again.",
      },
      data_integrity: {
        title: "Sync data needs attention",
        detail:
          "Some sync data may be missing or damaged. Keep your local files and check the copies on other devices or in a trusted backup first.",
      },
      unexpected: {
        title: "Sync could not finish",
        detail:
          "Try syncing again later. If the problem continues, report it for help.",
      },
    },
    reason: {
      manual: "Started manually",
      localChange: "Local data changed",
      automaticCheck: "Automatic update check",
    },
    state: {
      idle: "Idle",
      offline: "Waiting for network",
      recentSuccess: "Just synced",
      unchanged: "No sync needed",
      syncing: "Syncing",
      pushing: "Pushing",
      pulling: "Pulling",
      failed: "Sync failed",
    },
    stage: {
      preparing: "Preparing",
      pushing: "Pushing changes",
      pulling: "Pulling changes",
      applying: "Applying changes",
      sidecarComplete: "Finalizing sync results",
      calibre: "Updating library",
      complete: "Finishing",
    },
  },
} as const
