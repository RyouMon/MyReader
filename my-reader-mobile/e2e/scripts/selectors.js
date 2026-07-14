/**
 * Unified page-object selector map for MyReader mobile E2E tests.
 *
 * Prefer Maestro `text` (accessibilityLabel / visible label) over `id`/`testID`:
 * matches real user interaction and keeps UI accessible. Use bilingual regex
 * (`中文|English`) so flows work in any app locale.
 *
 * For reader settings controls, option selectors use the full accessible name
 * exposed by the control (`<section label>: <option label>`). This is required
 * because iOS exposes the combined accessibilityLabel rather than the visible
 * text alone.
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
    tocButton: "目录与书签|Contents and Bookmarks",
    settingsButton: "阅读设置|Reading Settings",
    tocSheet: "目录面板|Table of Contents panel",
    settingsSheet: "阅读设置面板|Reading Settings panel",
  },

  // Reader settings sheet controls. Values are the *full accessible name* the
  // control exposes (section label + option label). A trailing `.*` tolerance
  // lets the same selector match both the unselected name and the selected
  // state (`背景: 自动, 已选择`), so flows can tap an option even when it is
  // already active by default.
  readerSettings: {
    background: {
      label: "背景|Background",
      auto: "背景: 自动.*|Background: Auto.*",
      black: "背景: 黑色.*|Background: Black.*",
      white: "背景: 白色.*|Background: White.*",
    },
    pageDirection: {
      label: "翻页方向|Page Direction",
      horizontal: "翻页方向: 左右翻页.*|Page Direction: Horizontal.*",
      vertical: "翻页方向: 上下翻页.*|Page Direction: Vertical.*",
    },
    progression: {
      label: "阅读方向|Reading Direction",
      ltr: "阅读方向: 从左到右.*|Reading Direction: Left to Right.*",
      rtl: "阅读方向: 从右到左.*|Reading Direction: Right to Left.*",
    },
    spread: {
      label: "页面布局|Page Layout",
      auto: "页面布局: 自动.*|Page Layout: Auto.*",
      single: "页面布局: 始终单栏.*|Page Layout: Always Single.*",
    },
    // FontPicker options are hardcoded (not i18n): "Serif"/"Sans"/"系统".
    font: {
      label: "字体|Font",
      serif: "字体: Serif.*|Font: Serif.*",
      sans: "字体: Sans.*|Font: Sans.*",
    },
    fontSize: { label: "字号|Font Size" },
    lineHeight: { label: "行距|Line Height" },
    margin: { label: "边距|Margin" },
    alignment: {
      label: "对齐|Alignment",
      auto: "对齐: 自动.*|Alignment: Auto.*",
      justify: "对齐: 两端对齐.*|Alignment: Justify.*",
      start: "对齐: 左对齐.*|Alignment: Left.*",
    },
    column: {
      label: "栏|Columns",
      auto: "栏: 自动.*|Columns: Auto.*",
      single: "栏: 始终单栏.*|Columns: Always Single.*",
    },
    theme: {
      label: "主题|Theme",
      night: "主题: 夜间.*|Theme: Night.*",
    },
  },
}
