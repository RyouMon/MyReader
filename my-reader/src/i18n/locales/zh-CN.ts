export const zhCN = {
  translation: {
    errors: {
      io: "文件读写错误",
      database: "数据库错误",
      notFound: "未找到：{{message}}",
      config: "配置错误",
      serialize: "数据序列化错误",
      unknown: "未知错误",
      WEBDAV_UNAUTHORIZED:
        "连接失败：服务返回 401 Unauthorized，用户名或密码错误（{{detail}}）",
      WEBDAV_FORBIDDEN:
        "连接失败：服务返回 403 Forbidden，当前账号无访问权限（{{detail}}）",
      WEBDAV_NOT_FOUND:
        "连接失败：服务返回 404 Not Found，远程根路径不存在（{{detail}}）",
      WEBDAV_UNEXPECTED_STATUS: "连接失败：服务返回状态码 {{detail}}",
    },
    settings: {
      title: "设置",
      nav: {
        libraries: "书库管理",
        dataSources: "数据源管理",
        sync: "同步与下载",
        appearance: "外观",
        reading: "阅读偏好",
        about: "关于",
      },
      libraries: {
        title: "书库管理",
        description: "管理 Calibre 书库目录，支持添加多个本地书库并自由切换",
        added: "已添加的书库",
        empty: "暂无书库，请点击下方按钮添加",
        current: "当前",
        confirmDelete: "再次点击确认删除",
        bookCount: "{{count}} 本",
        deleteTitle: "删除书库",
        addPrompt:
          "请选择包含 metadata.db 的 Calibre 书库根目录。添加后将自动读取数据库中的书籍信息和封面。删除书库仅移除引用，不会影响磁盘文件。",
      },
      dataSources: {
        title: "数据源管理",
        description: "管理桌面端可访问的数据来源，当前支持本地存储与 WebDAV",
        configured: "已配置数据源",
        loading: "数据源加载中…",
        count: "{{count}} 个已添加连接",
        localDetail: "当前设备本地文件系统",
        localLabel: "本机",
        builtIn: "内置",
        confirmDelete: "再次点击确认",
        deleteTitle: "删除数据源",
      },
      reading: {
        cacheUsage: "缓存占用：{{used}} / {{total}}",
        cacheUsageEmpty: "缓存占用：--",
      },
      about: {
        title: "关于",
        description: "版本信息与开源许可",
      },
    },
    common: {
      add: "添加",
      delete: "删除",
      cancel: "取消",
      confirm: "确认",
      save: "保存",
      loading: "加载中…",
    },
  },
}
