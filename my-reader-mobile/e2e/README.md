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
继续操作书库，避免命中弹窗后方的同名按钮。目录项通过原生标识符和章节文字定位，
选中后必须确认目录关闭，避免命中后方同名的 WebView 节点。iOS WebView 快照可能包含屏幕外正文，不能仅凭正文文字存在证明导航成功。
固定分页夹具显式选择“始终单栏”，让一次翻页在不同屏幕上含义一致。
设置滚动使用[面板内的有界滑动](https://docs.maestro.dev/examples/recipes/custom-scrolling-for-screen-fragments)，从 `reader-settings-scroll` 实际滚动区域内开始；全屏 `scrollUntilVisible` 和固定屏幕坐标可能落在手机底部面板或 iPad 居中弹窗之外。
控件还必须位于面板标题下方，避免 iOS 快照中已滚出面板的节点被当成可点击目标。
单栏和双栏的首次位置恢复由 `ReaderStartLocationTests` 使用真实 WebKit 检查排版完成后文字是否在屏内，包括首次 resize 回调延迟、加载中容器尺寸变化和末尾空白栏场景。定位时使用正文布局视口宽度，避免首次布局尚未刷新宽度缓存或 `window.innerWidth` 在原生尺寸变化时短暂偏离正文栏宽，导致恢复后又退回前一页。测试显式保持该过渡状态直到定位结束，避免依赖竞态碰巧出现。
原生启动回归还让 WebKit 在首次布局期间保持忙碌，验证恢复锚点前不会上报临时章首位置；Readium 3.11.0 的依赖补丁将位置通知延后到初始定位完成，避免错误位置覆盖同步记录。
字体重建期间保存位置的原生回归直接验证 `ReadiumView` 返回排版事务保留的精确锚点，避免捕获已被替换或尚未加载的 Navigator。
删除后冷启动的缓存回归由 `query-provider.test.tsx` 覆盖：Core 已提交删除而查询缓存尚未落盘时，恢复后必须重新读取 Core。使用 [TanStack 持久化 Provider](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient) 协调恢复和首次查询，避免将旧缓存继续视为新鲜数据。
朗读引擎选项限定在原生菜单内，并重新打开菜单核对选中状态，防止误点后方供应商列表。
供应商表单的 iOS 返回手势从原生导航栏的左边缘开始，兼容 iPad 内缩弹窗与 iPhone 全宽页面。
Android 供应商表单先收起软键盘再定位 voice 输入框，并核对焦点、输入内容和保存按钮可用状态；无障碍快照可能把键盘下方的控件误判为可见。
WebDAV 表单同样在填写密码前收起 Android 键盘并滚动到输入框，提交后必须完成真实连接校验并显示已保存的数据源。
Android 文件选择器的设备入口限定为抽屉列表项，避免误点后方同名的目录面包屑。
设置、语音和 WebDAV 流程通过真实标签、列表与返回按钮导航，覆盖正常用户入口，并避免深链接切换留下已退出的 SafariViewService 导致 XCTest 驱动崩溃。
进入图书列表后先等待原生转场结束，再查找导入按钮；iOS 的无障碍快照可能提前包含仍在移动的目标控件。
iOS 冷启动后的首次设置导航允许在首页仍然可见时补发一次点击，随后必须通过离开首页和目标页面断言。
云端日志已证实 CoreSimulator 会在 Recap 触摸设备注册前丢弃按下事件（[Maestro #3686](https://github.com/mobile-dev-inc/Maestro/issues/3686)）；
固定 CLI 的 `retryTapIfNoChange` 又会把空快照误当成界面变化（[#3685](https://github.com/mobile-dev-inc/Maestro/issues/3685)）。
此处只补发一次幂等导航动作，不重启应用、不重跑流程，也不忽略后续断言。
Android 关闭重开 EPUB 时，WebView 偶尔只向无障碍树提供文档标题，即使正文已正确显示。
阅读游程按 [Maestro 官方建议](https://docs.maestro.dev/extra-materials/troubleshooting/known-issues) 在入口声明 `androidWebViewHierarchy: devtools`，补充 WebView 正文节点。继续检查目标页文字可见、旧页消失、书签和空导航历史，并保留字体切换、重新打开和冷启动验证。截图用于故障取证，不替代这些行为断言。
工具栏隐藏后按钮仍残留时，应同时检查实际画面与原生节点；节点禁用并不代表动画已正确完成。Reanimated 4.5.1 在 JS 线程阻塞或重复动画后可能恢复旧样式，移动端升级到包含[官方修复](https://github.com/software-mansion/react-native-reanimated/pull/9987)的 4.5.5，保留正常动画和工具栏显隐断言。
Maestro 2.11 会探测所有应用的 WebView 调试端口；[上游维护者确认](https://github.com/mobile-dev-inc/Maestro/pull/3419#issuecomment-4997305721)后台冻结进程仍暴露端口，重复查询会耗尽连接队列。固定 Google APIs 镜像中的 Google 搜索应用触发了相同问题：仅解冻该进程后超时消失，但强制停止后会被桌面重新启动。因此 runner 只在专用模拟器中禁用 `com.google.android.googlequicksearchbox`，隔离无关的后台 WebView；保留系统进程冻结、MyReader 生命周期、系统文件选择器和语音引擎。需要恢复该模拟器的 Google 搜索时，执行 `adb -s <serial> shell pm enable --user 0 com.google.android.googlequicksearchbox`。这是本项目经对照验证的环境隔离措施，不是 Maestro 提供的配置项；上游加入应用范围过滤后可移除。
Maestro 通过[官方设备选择参数](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/specify-and-start-devices) `--device` 指定专用模拟器，Android 连接由标准 ADB server 管理；安装、fixture 和故障诊断通过 `adb -s` 指定同一设备。
发布测试固定 Android 35、Emulator 36.6.11（15507667）、3072 MB 内存和 `swangle` 软件渲染，保持本地与 CI 的测试运行时一致。
Maestro 2.11 已包含调试连接的超时保护，但尚未按应用过滤端口；固定运行时不能替代上述后台进程隔离。
这些测试运行时设置不改变 APK 的目标版本、签名或完整用例清单。
iOS CI 明确使用 iOS 26.5 上的 iPhone 17 Pro 与 iPad Pro 13-inch (M5)，与本地验证设备一致，避免按设备列表顺序选中旧运行时。
PDF/CBZ 翻页在 Android 使用 1.2 秒连续滑动，给 `input swipe` 足够时间送达 MOVE 事件；短滑动在模拟器负载下可能只送达两次移动并触发分页回弹。
iOS 使用 200 毫秒：Maestro 2.11 的 [iOS 手势实现](https://github.com/mobile-dev-inc/maestro/blob/cli-2.11.0/maestro-ios-xctest-runner/maestro-driver-iosUITests/Routes/XCTest/EventRecord.swift) 在移动终点保持按下指定时长，复用 Android 的 1.2 秒会触发图片长按菜单。两端仍必须一次翻页成功，并验证重开后的页码。
EPUB 朗读用例使用 Readium 页面边缘点击进行手动翻页，检查目标页正文、独立播放位置和返回操作；PDF/CBZ 用例保留滑动覆盖。

```bash
# 仓库根目录；需要 Maestro 2.11.0、Java 17、Android 35 模拟器或 Xcode。
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
WebDAV 和 OpenAI 兼容语音 fixture。Android 使用模拟器的宿主回环地址 `10.0.2.2`，
iOS 使用 `127.0.0.1`；Android 同时移除 Metro 端口映射。测试只操作专用模拟器；不要向该模拟器放入个人书库或凭据。
iOS runner 编译并安装独立的 `MyReader Fixtures` 模拟器 App，由它通过 `NSFileCoordinator` 对每个夹具文件分别进行原子写入，发布到公开共享的 Documents 目录。整目录复制不会协调其中每个文档的写入，曾导致 Files 显示文件却无法解析 document ID。通过真实 Files 选择器访问“我的 iPhone/iPad → MyReader Fixtures”，测试结束卸载夹具 App；不直接修改 Files 私有存储。首次打开系统选择器按可见控件等待，允许冷启动服务耗时 60 秒。 每次导入都重新浏览到夹具目录，触发当前文件项的枚举；Files 恢复的旧列表可能持有已重启的 LocalStorage 提供器所分配的失效 ID，文件仍可见却无法选择。
Android 应用网络策略允许用户明确配置的 HTTP WebDAV 地址（表单默认 HTTPS），并保留系统 TLS 证书校验；Release 和 dev 使用同一策略，避免 Core 能列目录而原生下载被拦截。
专用 iOS 模拟器关闭 Password AutoFill，避免系统密码管理器保存 fixture 凭据并遮挡应用；产品本身的凭据输入和安全存储保持正常运行。
CI 等待专用 Simulator 启动后禁用其中的 APNs daemon，减少模拟器无法取得推送证书时的高频重试。本套件不包含推送通知流程，此设置不修改应用或宿主机服务；它不能消除上述 Recap 注册竞态。
所有数据源配置通过应用 UI 完成，不预填产品数据库，不需要 OneDrive 登录或真实付费 TTS。

报告默认保存到 `e2e/.artifacts/<platform>-<run-id>/`，可用 `E2E_REPORT_DIR` 指定目录。
报告包含安装包摘要、提交号、工作区状态、每个 flow 的 JUnit、失败截图和日志。
只有完整清单全部成功才写入 `passed.json`。网络朗读还检查实际合成请求。
单个流程最多运行 30 分钟，覆盖云端完整阅读流程的实际耗时；单步 UI 断言时限保持独立。
超时强制终止 Maestro JVM，使失败日志能够上传，不依赖可能卡住的 JVM 退出钩子。
Android 失败后额外采集系统日志、屏幕截图和 WebView 版本，即使 Maestro 本身卡死也保留诊断信息。

## 临时 iOS XCTest 驱动补丁

Maestro 2.11.0 的 XCTest runner 在截图请求超时后可能退出，后续操作全部失去连接（[上游问题 #3538](https://github.com/mobile-dev-inc/Maestro/issues/3538)）。
iOS CI 暂时从固定的官方源码构建驱动，并应用[固定提交的社区补丁](https://github.com/arun279/cue/blob/ca84a837c2806f5997c3a103c3209e288f7ef44c/patches/maestro-runner/0001-keep-serving-after-xctest-issues.patch)。
补丁将 XCTest issue 转成该请求的 HTTP 500 错误，并保持服务存活；断言、用例退出码和发布门禁继续处理真实失败。
本地故障注入已对照官方二进制、同环境重编译的原版和补丁版；另以必然失败的断言确认 CLI 仍返回失败。

`scripts/prepare-ios-maestro.py` 校验官方源码归档、补丁和原版驱动 JAR 的 SHA-256，
使用 Xcode 和锁定的 Swift Package 依赖构建，再仅替换独立 CLI 副本中的三个 Simulator 资源。
原版 CLI 和其余 JAR 内容保持不变；构建失败或校验不符会终止执行。
构建日志和来源、补丁、输出摘要保存在 CI 报告的 `driver/` 目录。
本地使用同一入口，输出目录必须尚不存在：

```bash
python3 my-reader-mobile/e2e/scripts/prepare-ios-maestro.py \
  "$HOME/.maestro" "$PWD/.tmp/maestro-ios" \
  --evidence "$PWD/reports/maestro-ios-driver"
export PATH="$PWD/.tmp/maestro-ios/bin:$PATH"
# 然后运行上文完整 iOS Release 套件。
```

该补丁只用于测试工具。官方发布等效修复后，先验证故障处理和完整套件，再移除补丁、构建脚本及 CI 接入步骤。

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
3. 桌面 Windows、macOS 运行完整浏览器集成/行为套件，以及 Release 原生 WebDriver 套件。
   Ubuntu 暂不执行 release E2E；Linux 安装包继续构建并核验。
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
