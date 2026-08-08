export const sharedEn = {
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
    collapse: "Collapse",
    favorite: "Favorite",
    readingProgress: "Reading progress",
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
        detail: "There are no books in this library yet.",
      },
      favorites: {
        title: "No favorites yet",
        detail: "Books you mark as favorites appear here.",
      },
      recentlyRead: {
        title: "No reading history yet",
        detail: "Books appear here after you open them.",
      },
      downloaded: {
        title: "No downloaded books yet",
        detail: "Downloaded books appear here for offline reading.",
      },
      downloading: {
        title: "No download tasks",
        detail: "Queued and active downloads appear here.",
      },
      uploading: {
        title: "No upload tasks",
        detail: "Queued and active uploads appear here.",
      },
      localOnly: {
        title: "No local-only books",
        detail: "Books not yet uploaded to remote storage appear here.",
      },
    },
    sort: {
      author: "Author",
      title: "Title",
    },
  },
  reader: {
    background: "Background",
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
    noActiveLibraryDetail: "Add or select a library to start syncing.",
    activeLibraryChanged: "The current library changed. Please try again.",
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
