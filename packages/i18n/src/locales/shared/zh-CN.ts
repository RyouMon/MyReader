export const sharedZhCN = {
  addLibraryFlow: {
    title: "添加书库",
    noLibrary: {
      title: "还没有添加书库",
      description: "创建新书库或打开已有书库。",
    },
    create: {
      title: "创建新书库",
      description: "创建 MyReader 书库",
    },
    open: {
      title: "打开已有书库",
      description: "打开已创建的 MyReader 书库或 Calibre 书库。",
    },
    help: {
      label: "关于书库",
      myreader: {
        title: "什么是 MyReader 书库？",
        body: "由 MyReader 创建和管理，支持导入、删除图书，以及编辑书名和作者。",
      },
      calibre: {
        title: "什么是 Calibre 书库？",
        body: "由 Calibre 创建和管理。MyReader 以只读方式打开，不会修改其中的图书和元数据。",
      },
      sync: {
        title: "关于阅读数据同步",
        body: "两种书库都支持在设备间同步阅读数据。将书库存放在云存储中，再从不同设备打开同一个书库即可。",
      },
      choice: {
        title: "我该选择哪一个？",
        body: "如果你之前使用 Calibre 管理书库，推荐选择“打开已有书库”；否则，选择“创建新书库”。",
      },
    },
    storageLocations: "可用位置",
    addStorage: "添加数据源",
    addWebdav: {
      title: "添加 WebDAV",
      description: "填写服务器地址和账号信息。",
    },
    addOnedrive: {
      title: "添加 OneDrive",
      description: "登录 Microsoft 账号。",
    },
  },
  bookDetail: {
    backToLibrary: "返回书库",
    collapse: "收起",
    favorite: "收藏",
    libraryUnavailable: {
      title: "当前书库不可用",
      detail: "它可能已被移除，请返回书库。",
    },
    loadFailed: {
      title: "无法加载书籍详情",
      detail: "读取书籍信息时出错，请重试。",
    },
    notFound: {
      title: "没有找到这本书",
      detail: "它可能已从当前书库中移除。",
    },
    readingProgress: "阅读进度",
    retry: "重试",
    synopsis: "简介",
  },
  bookRow: {
    unread: "未读",
  },
  common: {
    cancel: "取消",
    close: "关闭",
    delete: "删除",
    save: "保存",
  },
  library: {
    browseAllBooks: "浏览全部图书",
    importBook: "导入图书",
    label: "书库",
    collections: {
      transferSection: "传输",
      storageSection: "存储与同步",
      all: "全部图书",
      recentlyRead: "最近阅读",
      favorites: "收藏",
      downloaded: "已下载",
      downloading: "正在下载",
      uploading: "正在上传",
      localOnly: "仅本机",
      bookCount: "{{count}} 本",
    },
    noMatch: {
      search: {
        title: "搜索无结果",
        detail: "未找到与搜索词匹配的图书，请尝试其他关键词。",
      },
      empty: {
        title: "书库为空",
        myreaderDetail: "请先导入一本图书。",
        calibreDetail: "请通过 Calibre 向该书库添加图书。",
      },
      favorites: {
        title: "还没有收藏书籍",
        detail: "请先将一本图书加入收藏。",
      },
      recentlyRead: {
        title: "还没有阅读记录",
        detail: "请先打开一本图书开始阅读。",
      },
      downloaded: {
        title: "还没有已下载图书",
        detail: "请先下载一本图书。",
      },
      downloading: {
        title: "没有下载任务",
        detail: "请先从书库中选择一本图书开始下载。",
      },
      uploading: {
        title: "没有上传任务",
        detail: "请先从书库中选择一本仅存于本机的图书开始上传。",
      },
      localOnly: {
        title: "没有仅存于本机的图书",
        detail: "无需操作，当前没有等待上传的图书。",
      },
    },
    sort: {
      author: "作者",
      title: "书名",
    },
  },
  reader: {
    background: "背景",
    empty: {
      annotations: {
        title: "还没有高亮或笔记",
        detail: "请先选中文字，再添加高亮或笔记。",
      },
      bookmarks: {
        title: "还没有书签",
        detail: "请在阅读时添加书签。",
      },
    },
    fontOptions: {
      default: "默认",
      maru975Sc: "阿里妈妈方圆体",
      monospace: "等宽",
      notoSansSc: "思源黑体",
      notoSerifSc: "思源宋体",
      sans: "无衬线",
      serif: "衬线",
    },
    navigation: "目录",
    themes: {
      green: "护眼绿色",
      neutral: "纯白",
      night: "夜间",
      ocean: "深海",
      paper: "羊皮纸",
      sepia: "护眼米黄",
    },
  },
  settings: {
    title: "设置",
  },
  syncStatus: {
    title: "同步状态",
    details: "同步详情",
    accessibilityLabel: "同步状态：{{status}}",
    currentLibrary: "当前书库",
    currentStatus: "当前状态",
    currentStage: "当前阶段",
    currentReason: "同步原因",
    lastReason: "上次同步原因",
    lastSync: "上次同步",
    lastAttempt: "上次尝试",
    noHistory: "暂无同步记录",
    failureReason: "失败原因",
    failureStage: "失败阶段",
    progress: "{{completed}} / {{total}}",
    manualSync: "立即同步",
    syncingAction: "正在同步",
    waitingForNetwork: "等待网络",
    offlineDetail: "当前书库的传输方式需要网络，恢复连接后可继续同步。",
    noActiveLibrary: "暂无可同步书库",
    noActiveLibraryDetail: "请先添加书库。",
    activeLibraryChanged: "当前书库已改变，请重试。",
    reason: {
      manual: "手动触发",
      localChange: "本地数据更新",
      automaticCheck: "自动检查书库更新",
    },
    state: {
      idle: "空闲",
      offline: "等待网络",
      recentSuccess: "刚刚已同步",
      unchanged: "无需同步",
      syncing: "同步中",
      pushing: "正在推送",
      pulling: "正在拉取",
      failed: "同步失败",
    },
    stage: {
      preparing: "正在准备",
      pushing: "正在推送更改",
      pulling: "正在拉取更改",
      applying: "正在应用更改",
      sidecarComplete: "正在整理同步结果",
      calibre: "正在更新书库",
      complete: "正在完成",
    },
  },
} as const
