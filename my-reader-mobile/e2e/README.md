# Mobile Release E2E

日常开发使用 dev build，直接操作模拟器或真机验证。开发或维护端到端用例、准备 release、
以及需要排查原生打包差异时，使用完整的独立 Release 构建运行此套件。
原生代码变动必须重新构建；Metro 刷新不能替代原生验证。

## 完整执行入口

`release-suite.json` 是发布套件清单。Android 全部执行；iOS 在 iPhone 和 iPad 各执行全部流程，
包括原生阅读设置弹层中的字体切换和位置保持。
任何失败都阻断发布；没有 `wip`、排除标签、AI 判断或整例自动重试。

iOS 使用官方 `snapshotKeyHonorModalViews: false`，让 iPad 系统文件选择器的跨进程控件进入
可访问性快照。选择器内的返回、取消操作限定在 `Browse View (Picker)`，并等待选择器关闭后
继续操作书库，避免命中弹窗后方的同名按钮。目录项限定在目录标题下方，避免命中书页上的
同名章节标题；iOS WebView 快照可能包含屏幕外正文，不能仅凭正文文字存在证明导航成功。
朗读引擎选项限定在原生菜单内，并重新打开菜单核对选中状态，防止误点后方供应商列表。
Android 阅读流程使用 Maestro 官方 `androidWebViewHierarchy: devtools`，避免章节跳转后
原生无障碍快照遗漏 WebView 正文；仍检查翻页后的可见文字与旧页消失。

```bash
# 仓库根目录；需要 Maestro 2.11.0、Java 17、Android SDK 或 Xcode。
python3 -m venv .tmp/e2e-python
.tmp/e2e-python/bin/pip install -r my-reader-mobile/e2e/requirements.txt
export E2E_PYTHON="$PWD/.tmp/e2e-python/bin/python3"
export MAESTRO_DRIVER_STARTUP_TIMEOUT=600000

# Android：传入已构建的 Release APK 和专用模拟器序列号。
node my-reader-mobile/e2e/scripts/run-release.mjs android /absolute/path/app-release.apk emulator-5554

# iOS：先启动专用模拟器；传入 Release-iphonesimulator 下的 .app。
# 同一 app 分别在 iPhone、iPad 上执行。
node my-reader-mobile/e2e/scripts/run-release.mjs ios /absolute/path/MyReader.app <simulator-udid>
```

也可使用 `pnpm --filter my-reader-mobile test:e2e:android <apk> <serial>` 或
`test:e2e:ios <app> <udid>`。相对安装包路径相对于命令工作目录，推荐绝对路径。
脚本拒绝 Android 真机、debug APK、错误应用 ID、缺少内置 JS 的应用，以及无法在模拟器运行的 IPA。
iOS Release simulator 在 CI 通过 Expo prebuild 和 Xcode Release 构建，使用与 production 相同的入口、Core 绑定和环境配置；本地也可使用 `eas.json` 的 `release-simulator`。

脚本安装指定包、创建唯一 fixture 目录、通过系统选择器导入自制 EPUB/PDF/CBZ，并启动本地
WebDAV 和 OpenAI 兼容语音 fixture。Android 自动设置 fixture 所需的 `adb reverse`，移除
该模拟器的 Metro 端口映射。测试只操作专用模拟器；不要向该模拟器放入个人书库或凭据。
所有数据源配置通过应用 UI 完成，不预填产品数据库，不需要 OneDrive 登录或真实付费 TTS。

报告默认保存到 `e2e/.artifacts/<platform>-<run-id>/`，可用 `E2E_REPORT_DIR` 指定目录。
报告包含安装包摘要、提交号、工作区状态、每个 flow 的 JUnit、失败截图和日志。
只有完整清单全部成功才写入 `passed.json`。网络朗读还检查实际合成请求。

## 测试金字塔与旧 20 个流程的去向

已有下层测试继续保留。新增供应商表单保存/删除失败的组件回归，补齐从 UI 长流程移出的分支。
表中的文件均为可执行测试；被移出的视觉枚举不再通过像素、颜色截图或 AI 判定来冻结布局。

| 原流程 | 当前覆盖 |
| --- | --- |
| `smoke/launch_app` | 每个独立 Release 场景的冷启动前置条件 |
| `library/import_local_supported_formats` | `release/local-reader`：系统文件选择器导入 EPUB/PDF/CBZ、真实原生阅读 |
| `library/delete_local_supported_formats` | 合并到 `release/local-reader` 末尾，实际删除并确认书库为空 |
| `library/manage_local_myreader_library` | iOS `release/external-library`：系统目录授权、重启后重新读取；创建/元数据/删除分支由 Core library/catalog 测试承担 |
| `library/manage_webdav_myreader_library` | `release/webdav`：本地真实 DAV、上传、删除下载、显式下载、重启恢复，以及清空本地数据后同步位置和书签；上传并发/取消/两端收敛由 Core library 测试承担 |
| `library/manage_onedrive_myreader_library` | `src/services/remote/onedrive/backend.test.ts` 的目录、下载 URL、错误和并发创建合同，以及共享 Core library 测试；真实账户 OAuth 是独立人工集成检查，不是自动发布前置条件 |
| `library/navigate_root_header` | 合并到 `release/local-reader`：原生标签、搜索首次/再次聚焦、一次返回、系统导入取消 |
| `library/search_with_catalog_tokens` | 与上述原生搜索入口合并；组合筛选由 `use-catalog-search-presentation.test.ts`、`catalog-directory-screen.test.tsx` 及 Core catalog 测试承担 |
| `reader/read_book` | `release/local-reader`：目录、翻页、书签、关闭后恢复，保留真实 Readium 层 |
| `reader/read_with_tts` | 同一阅读游程分别使用系统语音与本地网络语音，确认实际网络请求 |
| `reader/tts_playback_lifecycle` | 关键启动/暂停/恢复/停止并入上述语音游程；终态和取消矩阵移至原生 `TtsPlaybackNavigationStateTests.swift` / `TtsPlaybackNavigationStateTest.kt` |
| `reader/tts_playback_position_authority` | 保留翻页后继续朗读、返回朗读位置；精确预取/边界矩阵由 `RemoteTtsPrefetchWindowTests.swift` / `RemoteTtsPrefetchWindowTest.kt` 和 viewport/start locator 测试承担 |
| `reader/change_epub_settings` | `reader-reflow-preferences.test.ts`、`app-store.slices.test.ts`：主题/字号/间距/对齐/栏数与持久化；原生字体切换保留在阅读游程 |
| `reader/change_epub_settings_on_pad` | 同一偏好合同；iPad 完整 Release 游程及原生设置验证，移除云端 AI 布局判断 |
| `reader/change_cbz_settings` | `ReadiumFixedReader.test.tsx`、`fixed-reader-navigation.test.ts` 与 store 偏好合同；真实 CBZ 翻页/恢复仍在 Release 游程 |
| `reader/change_cbz_settings_on_pad` | 同上，iPad 运行完整 Release 游程 |
| `reader/change_pdf_settings` | `ReadiumFixedReader.test.tsx`、`PdfPreferencesContractTest.kt` 与 store 偏好合同；真实 PDF 翻页/恢复仍在 Release 游程 |
| `reader/change_pdf_settings_on_pad` | 同上，iPad 运行完整 Release 游程 |
| `settings/navigate_settings` | `settings-screen.test.tsx`、`add-library-screen.test.tsx` 和 `use-reader-tts-settings-navigation.test.ts`；原生设置入口已由书库/供应商游程覆盖 |
| `settings/navigate_tts_providers` | 保留原生 pushed 页面返回/手势；CRUD、校验、保存失败、删除确认移至 `tts-provider-profile-screen.test.tsx` 和 Core TTS 配置测试 |

Core 远程书库关键合同位于 `my-reader-core/src/services/library.rs`：
`should_complete_sidecar_sync_when_remote_import_upload_is_pending`、
`should_cancel_pending_upload_when_remote_book_is_deleted`、
`should_converge_remote_myreader_files_across_two_devices`。
不再为观察上传中的瞬间而导入数百 MB 文件或依赖固定延时。

## 发布流水线

推送版本标签触发 `.github/workflows/release.yml`：

1. 校验版本，构建桌面安装包、签名 Android APK、iOS IPA 和同提交的 iOS Release simulator app。
2. 运行完整 Quality 工作流；Android 使用将要发布的同一 APK，iPhone/iPad 使用同一 simulator app。
3. 桌面三种操作系统运行完整浏览器集成/行为套件，以及 Release 原生 WebDriver 套件。
4. 检查全部报告与提交号、清单完整性和安装包摘要；只接受无失败、无跳过、无 flaky 的结果。
5. 所有检查成功后提交已构建的 IPA 到 TestFlight，再上传并自动公开 GitHub Release。

手动运行 `Release` 是完整演练：构建和全部测试照常执行，生成 `MyReader-Verified-Release`，
但不会提交 TestFlight 或公开版本。单独的两个 candidate build 工作流只生成构建产物。

iOS IPA 的设备架构不能运行在 Simulator；其 Release simulator app 与 IPA 使用同一提交、
production 环境和原生依赖。模拟器结果不等同于设备签名、Apple 处理或真机验证。
桌面 WebDriver 仅由可选 `e2e` Cargo feature 启用，使用独立应用 ID；发布安装包不含该测试服务。
浏览器层使用真实前端和 IPC 替身；原生层使用真实 Tauri/Core、文件及 WebView。

## 维护要求

- 日常 dev 验证与 Release 自动化分开；不要添加 Expo launcher/Metro 弹窗绕过逻辑。
- 新增行为先判断适合 Core、原生单元、组件、浏览器集成还是设备 E2E，避免堆叠长流程。
- 流程使用可访问名称、真实状态等待和系统选择器。失败应修复产品、fixture 或过期断言。
- `pnpm test:qa` 检查所有 YAML 有效、全部流程可达、无过滤或重试，以及发布依赖链完整。
- 原生 E2E 的测试用 transport 不验证系统文件对话框；移动端真实系统选择器由 Maestro 覆盖。
