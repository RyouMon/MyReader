/**
 * Unified page-object selector map for MyReader mobile E2E tests.
 *
 * Prefer Maestro `text` (accessibilityLabel / visible label) over `id`/`testID`:
 * matches real user interaction and keeps UI accessible. Use bilingual regex
 * (`中文|English`) so flows work in any app locale.
 */
output.selectors = {
  tabs: {
    home: "主页|Home",
    library: "书库|Library",
    settings: "设置|Settings",
  },

  settings: {
    header: {
      close: "关闭|Close",
      back: "返回|Back",
      iosNativeBack: "返回|Back",
      titles: {
        libraryDetail: "书库详情|Library Details",
        addLibrary: "添加书库|Add Library",
        webdavSources: "WebDAV 数据源|WebDAV Sources",
        webdavAdd: "添加 WebDAV 数据源|Add WebDAV Source",
        webdavDetail: "数据源详情|Source Details",
        webdavBrowser: "选择 WebDAV 书库|Select WebDAV Library",
        onedriveSources: "OneDrive 数据源|OneDrive Sources",
        onedriveDetail: "数据源详情|Source Details",
        onedriveBrowser: "选择 OneDrive 书库|Select OneDrive Library",
      },
    },
    toolbar: {
      libraryDelete: "删除书库|Delete Library",
      dataSourceDelete: "删除数据源|Delete Source",
      webdavAdd: "添加 WebDAV 数据源|Add WebDAV Source",
      onedriveAdd: "添加 OneDrive 数据源|Add OneDrive Source",
      selectDirectory:
        "选择当前目录为书库|选择当前目录作为书库|Select current directory as library",
      addWebdavDone: "完成中|完成|Completing|Complete",
    },
    rows: {
      addLibrary: "添加书库|Add Library",
      addLibraryWebdav: "添加 WebDAV 数据源|Add WebDAV Source",
      addLibraryOnedrive: "添加 OneDrive 数据源|Add OneDrive Source",
      webdav: "WebDAV",
      onedrive: "OneDrive",
    },
  },

  fixtures: {
    libraryName: "Example1",
    webdavSource: "Test WebDAV",
    onedriveSource: "Test OneDrive",
    localStorage: "本地存储|Local Storage",
  },

  reader: {
    moreActions: "更多操作|More Actions|More actions",
    tocButton: "目录|Table of Contents",
    settingsButton: "阅读设置|Reading Settings",
  },
};
