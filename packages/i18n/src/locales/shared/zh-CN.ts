export const sharedZhCN = {
  operationError: {
    unexpected: "未能完成此操作，请重试。",
    connectivity: "无法连接服务，请检查网络连接和服务地址后重试。",
    credential: "访问被拒绝，请检查凭据或重新登录。",
    configuration: "请检查书库或服务设置后重试。",
    notFound: "此项目已不可用，请刷新后重试。",
    io: "无法访问本地文件，请检查存储空间和文件权限。",
    dataIntegrity: "部分数据无法正确读取，请从可靠的副本恢复后重试。",
    tts: "朗读失败，请检查朗读设置后重试。",
  },
  qwenTts: {
    title: "Qwen（通义千问）",
    add: "添加 {{name}}",
    description: "使用与服务地址对应的凭据，支持指定音色。",
    sources: {
      tokenPlan: {
        title: "Qwen · Token Plan",
        description: "使用千问套餐额度和套餐专用密钥。",
        credential: "Token Plan 套餐密钥（sk-sp- 开头）",
      },
      qianwen: {
        title: "Qwen · 按需计费",
        description: "使用千问 AI 平台 API，按实际用量计费。",
        credential: "千问 AI 平台 API Key（非套餐密钥）",
      },
      dashscope: {
        title: "Qwen · DashScope（百炼）",
        description: "使用阿里云百炼 API，默认北京地域。",
        credential: "阿里云百炼 API Key（与服务地域一致）",
      },
    },
    manualVoicesAction: "手动输入音色 ID",
    manualVoices: "音色 ID",
    manualVoicesHint: "仅用于列表中未显示的官方或自定义音色，每行一个 ID。",
    loadingVoices: "正在获取账户音色…",
    voicesFailed: "账户音色获取失败，可继续使用已有音色或手动输入。",
    voicesEmpty:
      "当前模型暂无账户音色，请先在对应平台创建音色，或输入已有音色 ID。",
    credentialRequired:
      "填写与服务地址对应的 API Key；Token Plan 使用 sk-sp- 开头的套餐密钥",
  },
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
    copy: "复制",
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
    failureSummary: "同步失败：{{title}}",
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
    failure: {
      connectivity: {
        title: "暂时无法连接",
        detail: "请检查网络连接和数据源是否可用，然后重试同步。",
      },
      credential: {
        title: "请检查数据源访问权限",
        detail: "请重新登录或更新数据源凭据，并确认此账号有权访问书库。",
      },
      configuration: {
        title: "请检查书库设置",
        detail: "请检查书库位置和数据源设置，然后重试同步。",
      },
      data_integrity: {
        title: "同步数据需要检查",
        detail:
          "部分同步数据可能缺失或损坏。请保留本地文件，先检查其他设备或可靠备份中的数据副本。",
      },
      unexpected: {
        title: "未能完成同步",
        detail: "请稍后重试同步；如果问题持续出现，请反馈此问题。",
      },
    },
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
