# Reader E2E — 阅读设置生效测试

验证 EPUB / CBZ / PDF 三种格式的阅读设置是否即时生效。Flow 按 `maestro-bdd-spec.md` 的 flow/subflow 结构组织；场景描述写在 flow 注释里。规约参考 `features/*.feature`（审核用 spec，非可执行）。

阅读设置中依赖旧预置书库的 flow 仍标记为 `wip`。MyReader 书库生命周期使用独立的外部环境配置和 fixture 准备脚本，见下文。

## 前置条件

1. **Metro + dev build**：`pnpm run start` 启动 Metro；目标模拟器上装好 development build（`pnpm exec expo run:ios --device <UDID>`）。dev build 未安装时 deep link 无法打开阅读器。
2. **Maestro AI 后端**（仅 `change_epub_settings_on_pad.yaml` 需要）：见下文。

## Maestro AI 后端（AI flow 必需）

`assertWithAI` / `extractTextWithAI` 走 **Maestro Cloud**，需要鉴权。**无法自动配置**——需任选其一：

- `maestro login`（浏览器 OAuth，免费 Maestro Cloud 账号即可），或
- `export MAESTRO_CLOUD_API_KEY=<key>`（key 来自 https://cloud.mobile.dev）。

> 旧的 `MAESTRO_CLI_AI_KEY` / `MAESTRO_CLI_AI_MODEL` 已不再生效。

占位文件：`.env.example`。未配置 AI 时，跳过 `change_epub_settings_on_pad.yaml`（已标记 `@wip`）。

## Tag 方案

`config.yaml` 仅发现 `flows/` 下的流程，默认排除 `skip`、`wip`、`external-library`。设备/视觉维度用 tag 切分：

| tag | 含义 |
|---|---|
| `visual` | 含 `assertWithAI` / `extractTextWithAI`。当前仅 `change_epub_settings_on_pad.yaml` 使用该 tag |
| `phone` | 仅手机（窄屏）有意义：跨页窄屏退化、手机单栏 |
| `ipad` | 仅 iPad（宽屏）有意义：横屏自动布局下的双页/双栏、iPad 栏数 |
| 无设备 tag | 设备无关（背景、阅读方向、纵向滚动、文本样式等），手机/iPad 均跑 |

每条 flow 一个行为类（设置项），文件名用**用户动作动词**开头（`change_*` 改设置 / `read_*` 以某种方式阅读 / `switch_*` 切换模式 / `adjust_*` 调滑块），描述用户使用应用的行为，而非开发者验证。场景以 `# Scenario:` 注释线程化于单文件内；同一 flow 内只启动应用并打开图书一次，然后按顺序修改各项设置，不再为每个场景 relaunch。

## 设备矩阵

| 设备 | 用途 | 朝向 |
|---|---|---|
| iPhone（如 iPhone 17） | 默认；`@phone` flow + 设备无关 flow | PORTRAIT（部分 LANDSCAPE） |
| iPad 模拟器 | `@ipad` flow + 设备无关 flow | LANDSCAPE / PORTRAIT |

## 运行命令

```bash
cd my-reader-mobile
export MAESTRO_DRIVER_STARTUP_TIMEOUT=600000
export APP_ID=ryoumon.myreadermobile
# 配好 AI 后再加：export MAESTRO_CLOUD_API_KEY=...

# 当前默认稳定 flow
maestro test --config=e2e/config.yaml e2e -e APP_ID=$APP_ID

# 单条 WIP flow 调试
maestro test --config=e2e/config.yaml e2e/flows/reader/change_cbz_settings.yaml -e APP_ID=$APP_ID
```

> 截图/AI 素材等测试产物默认输出到 `e2e/.artifacts/`，该目录已加入 `.gitignore`，不会进入版本控制。

## MyReader 书库生命周期

`flows/library/` 覆盖应用容器本地存储、WebDAV、OneDrive 的创建、导入、立即阅读、上传、同步、重启持久化、删除本地文件、按需下载、删除图书和移除注册。每段行为都以 `# Scenario:` 注释写在 Flow 中，可直接作为人工走查清单阅读。

外部流程标记为 `external-library`，默认测试配置不会误跑真实远程数据源。运行前：

1. 在应用中预先添加一个可写 WebDAV 数据源并完成 OneDrive 登录。OAuth token、WebDAV 密码不会传给 Maestro。
2. 从 `.env.example` 复制书库测试变量到忽略提交的 `e2e/.env.library.local`。`*_SOURCE_NAME` 必须与应用中已有数据源名称一致；两个 EPUB 源路径必须是绝对路径。
3. 远程 EPUB 建议使用约 512 MB 的有效文件，确保快速局域网中也能稳定观察“同步不等待上传”、上传中删除和“重启续传”。准备脚本会把 fixture 复制到模拟器“文件 > 下载 > MyReaderE2E > Fixtures”。
4. 启动 Metro 和 development build，然后运行：

```bash
IOS_SIMULATOR_UDID=<udid> ./e2e/scripts/run-library-flows.sh
```

只验证本地 MyReader 书库的 EPUB、PDF、CBZ 元数据、封面、阅读和删除，可直接运行：

```bash
IOS_SIMULATOR_UDID=<udid> ./e2e/scripts/run-local-supported-formats.sh ios
ANDROID_SERIAL=emulator-5554 ./e2e/scripts/run-local-supported-formats.sh android
```

先在目标模拟器安装应用；iOS 还需安装 XcodeGen（`brew install xcodegen`），并打开一次“文件”应用以初始化 Downloads。Release 构建不需要 Metro，development build 需要 Metro（Android 执行 `adb reverse tcp:8081 tcp:8081`）。

脚本使用 `fixtures/tts-book` 生成的 EPUB 和 `fixtures/formats` 中项目自制的三页 PDF、CBZ，经系统文件选择器导入。统一阅读流程验证 EPUB 目录跳转、翻页、字体、书签恢复，以及 PDF/CBZ 翻页和重新打开的位置恢复；最后验证进程重启持久化与图书删除。iOS 额外检查应用容器 `Documents/libraries/<id>/` 中三个封面均为有效 JPEG，且删除书库后容器被清理。

脚本每次默认生成新的 `E2E_RUN_ID`，因此不会与上次 WebDAV 或 OneDrive 的测试目录同名。也可以显式设置 `E2E_RUN_ID` 复现某次运行；若重复使用同一个值，需先自行移除同名远程目录。远程流程只移除应用注册和本地缓存，不删除远程文件；本地流程删除书库时会删除对应的应用容器。

三个可单独运行的 Flow：

- `manage_local_myreader_library.yaml`：iOS 外部目录创建、导入阅读、收藏、元数据修改、重启持久化、验证“打开已有书库”的本地存储入口、删除图书。
- `manage_webdav_myreader_library.yaml`：后台上传、上传前禁止删除本地文件、上传中删除、同步不等待上传、按需下载、远端删除与重开。
- `manage_onedrive_myreader_library.yaml`：Graph 上传、进程重启续传、token 并发路径、远端-only 下载后留在书库，再次点击阅读。

## TTS 端到端验证

仓库内置一个短文本 EPUB 和本地 HTTP 语音服务，用于验证系统朗读与 OpenAI-compatible
两条首期链路，不会向真实推理服务发送正文。

```bash
cd my-reader-mobile
./e2e/scripts/prepare-tts-fixture.sh
node e2e/scripts/tts-fixture-server.mjs
```

将生成的 `e2e/.artifacts/MyReader-TTS.epub` 导入一个测试用本地 MyReader 书库。Android 还需执行
`adb reverse tcp:5050 tcp:5050`。然后在「设置 > 朗读与语音」中依次选择以下引擎，并为每个引擎运行
同一条控制流：

```bash
maestro test --config=e2e/config.yaml e2e/flows/reader/read_with_tts.yaml \
  -e APP_ID=ryoumon.myreadermobile
maestro test --config=e2e/config.yaml e2e/flows/reader/tts_playback_lifecycle.yaml \
  -e APP_ID=ryoumon.myreadermobile
maestro test --config=e2e/config.yaml e2e/flows/reader/tts_playback_position_authority.yaml \
  -e APP_ID=ryoumon.myreadermobile
```

- 系统朗读：无需额外配置。
- OpenAI-compatible：地址 `http://127.0.0.1:5050/openai`，凭据 `fixture-openai-key`。

验证网络引擎时，先用 `curl -X POST http://127.0.0.1:5050/reset` 清空请求记录，再选择供应商；
随后运行阅读 flow，中间不要再次 reset。运行后用以下命令验证鉴权及合成请求合同：

```bash
node e2e/scripts/assert-tts-fixture-requests.mjs openai
```

`read_with_tts.yaml` 验证播放器展开但不自动起播、长按选文后通过“从这里朗读”起播、句子高亮、
暂停/恢复、上一句/下一句、进度跳转后从当前页第一行开始且不回跳，以及停止。
`tts_playback_lifecycle.yaml` 独立覆盖播放与暂停两种状态下的上一句、下一句、手动翻页、返回播放
位置、从当前位置播放及停止，确保手动翻页不会改变朗读游标或被立即拉回。Flow 不会删除测试书库
或供应商，验证结束后应在应用中移除临时配置。
`tts_playback_position_authority.yaml` 验证手动翻页后始终返回最新朗读句、朗读追上可见页时立即
收起位置操作，以及停止后重新播放会从当前可见页开始。

iOS 的 `UIEditMenuInteraction` 位于 XCTest 应用可访问性树之外。Flow 会保存带“从这里朗读”的
原生菜单截图，再用播放器继续其余自动化场景；菜单动作本身需在模拟器中手动点击验证。Android
可直接按菜单文本完成自动点击。

## Flow 清单

### CBZ（book id 2，Bobby Make-Believe，4 页）
- `change_cbz_settings.yaml` — 用户改 CBZ 手机阅读设置：背景色切换后断言控件选中状态与页码可见、阅读方向 RTL、无上下翻页、自动/始终单栏布局（@phone @wip）
- `change_cbz_settings_on_pad.yaml` — iPad 横屏下自动布局并排两页阅读（@ipad @wip）

### PDF（book id 5，傲慢与偏见）
- `change_pdf_settings.yaml` — 用户改 PDF 手机阅读设置：背景色切换后断言控件选中状态与页码可见、阅读方向 RTL、上下翻页（纵向滚动）、自动/始终单栏布局（@phone @wip）
- `change_pdf_settings_on_pad.yaml` — iPad 横屏下自动布局并排两页阅读（@ipad @wip）

### EPUB（book id 1，卡拉马佐夫兄弟，898 页）
- `change_epub_settings.yaml` — 用户改 EPUB 手机阅读设置：夜间主题 / 字体族(Sans) / 两端对齐 / 字号/行距/页边距滑块值变化 / 手机竖屏单栏，全部通过控件状态或数值标签断言（@phone @wip）
- `change_epub_settings_on_pad.yaml` — iPad 栏数=auto 横屏双栏/竖屏单栏；强制单栏横屏→单栏（@visual @ipad @wip，dev-client 在 iPad 上锁定 portrait 导致横屏渲染异常，且栏数无结构代理，故保留 AI 断言，待 release build 验证）
- `read_with_tts.yaml` — 使用专用 EPUB 验证系统或网络 TTS 的“从这里朗读”、进度跳转稳定性、暂停/恢复、上一句/下一句和停止（@external-library）
- `tts_playback_lifecycle.yaml` — 使用专用 EPUB 覆盖播放与暂停状态下的完整朗读控制及手动翻页生命周期（@external-library）
- `tts_playback_position_authority.yaml` — 验证最新朗读位置、可见页追平和停止后从当前页重新播放（@external-library）

### 复用 subflow（`common/`，`@skip`）
- `launch_and_prepare.yaml` — `clearState` 启动应用并关闭 dev launcher，回到首页
- `open_reader_by_id.yaml` — 仅 deep link 打开指定 book（`BOOK_ID` env），调用方需先准备好书库数据
- `open_reader_settings.yaml` — 任意 chrome 状态下打开阅读设置面板（隐藏则点中心显出）
- `close_reader_sheet.yaml` — 关闭设置面板，保留 chrome 可见（供页码指示器断言）

## 已知校准点（首次运行需确认）

1. **iOS 半屏弹窗测试**：[Maestro #1924](https://github.com/mobile-dev-inc/Maestro/issues/1924) 会在全屏阅读器上漏掉半屏 sheet 的快照子树，`snapshotKeyHonorModalViews` 也不能修复。Android 的 `read_book.yaml` 直接按标签切换字体；iOS 完整格式脚本随后调用 `run-ios-reader-settings.sh`，用 Apple XCTest 从书库打开同一 EPUB，按标签切换两种字体、检查可点击性和选中状态，并验证关闭重开后的原文位置。XcodeGen 只生成测试工程，工程和 `.xcresult` 均位于忽略的 `.artifacts/`。不要为测试改动产品弹窗尺寸或使用坐标替代字体控件。
2. **`open_reader_by_id.yaml` 的 `BOOK_ID` 不要声明默认值**：`env: BOOK_ID: "1"` 会覆盖 caller 通过 `runFlow: { env: { BOOK_ID: "2" } }` 传入的值，导致所有 CBZ/PDF/EPUB flow 都打开 book 1 (EPUB)。已移除该默认块，由 caller 显式传入。`common/open_reader_by_id.yaml` 中有注释说明。
3. **FXL（CBZ / PDF）用 swipe 翻页，EPUB reflow 用 tap 翻页**：CBZ 与 PDF 现在走 Readium FXL navigator，`tapOn` 边缘不翻页。LTR 下 `swipe: { direction: LEFT }` = 下一页；iOS / PDF 的 RTL 下 `swipe: { direction: RIGHT }` = 下一页。Android CBZ 的 `ImageNavigatorFragment` 在 RTL 时通过 `R2RTLViewPager` 翻转页序，因此 RTL 下仍用 `swipe: { direction: LEFT }` 进入下一页。EPUB reflow（`read_book.yaml`）仍可用 `tapOn: { point: "85%,50%" }` 翻页。所有 FXL flow 的翻页断言前需先隐藏 chrome（`tapOn: point "50%,50%"`），否则 swipe 可能不生效；页码指示器在 chrome 隐藏时仍可见。
4. **滑块（字号/行距/页边距）按 accessibilityLabel 定位**：`SliderControl` 移除了 `testID`，改为 `accessibilityLabel={label}` + `accessibilityRole="adjustable"` + `accessibilityValue`。Maestro 通过 `scrollUntilVisible`（`common/scroll_settings_until.yaml`）找到滑块，再用 `tapOn: { text: ${...label}, point: "90%,50%" }` 点击轨道右侧改变数值。`tapToSeek` 仍只响应轨道上的 tap，不要点数值标签。
5. **PDF chrome 切换修复**：PDFKit 吞掉了一般 `onTap`，native 侧给 `PDFDocumentView` 加了 `UITapGestureRecognizer`，把中心点 tap 转发到 JS 的 `onToggleChrome`。所有 PDF/CBZ flow 隐藏 chrome 后翻页/断言，避免 PDFKit 拦截或 chrome 干扰。
6. **页码断言用正则 `N / .*`**：Maestro 对字符串末尾空格的部分匹配不可靠，PDF/CBZ/EPUB 统一用 `"1 / .*"`、`"2 / .*"` 或 `assertNotVisible: "1 / .*"` 验证分页变化。CBZ 总页数 `1 / 4`，EPUB `1 / 898`，PDF 总页数未知用 `.*`。
7. **`栏` / `页面布局` 选项统一为自动 + 始终单栏**：Reflow EPUB 的「栏」和 Fixed PDF/CBZ 的「页面布局」都只有两个选项——左「自动」、右「始终单栏」。`auto` 在宽屏自动多页/多栏、窄屏自动退化；`never`（Fixed）或 `1`（Reflow）强制单页/单栏。iPad 横屏双页/双栏场景因此选择「自动」验证；手机窄屏退化场景也选择「自动」。
8. **阅读设置的视觉项不再使用 AI 断言**：
   - CBZ/PDF 背景色：改为断言选项进入选中状态（`背景: 黑色, 已选择|Background: Black, Selected`）并确认关闭面板后页码指示器可见。
   - EPUB 夜间主题 / Sans 字体 / 两端对齐：改为断言选项选中状态。
   - EPUB 字号 / 行距 / 边距：通过滑块数值标签变化验证（如 `assertNotVisible: "18px"`）。
   - EPUB 手机栏数：断言默认 `栏: 自动, 已选择|Columns: Auto, Selected`。
   - 唯一保留 AI 的是 `change_epub_settings_on_pad.yaml`：iPad 横竖屏栏数没有结构/行为代理，且 dev-client 旋转渲染异常，因此仍用 AI 并标记 `@wip`。
9. **iPad 横屏朝向要用 `LANDSCAPE_LEFT`**：`setOrientation: LANDSCAPE` 会被 Maestro 解析失败；正确值是 `LANDSCAPE_LEFT` / `LANDSCAPE_RIGHT` / `PORTRAIT`。iPad flow 把 `setOrientation` 放在打开 reader 之后，避免 deep-link prompt 在 landscape 下点击异常。
10. **iPad dev-client portrait 锁定**：当前 dev-client 构建在 iPad 上横屏时，整个 app UI 仍以 portrait 渲染并被系统旋转 90°，`change_epub_settings_on_pad.yaml` 因此无法正确验证栏数，已标记 `@wip`。`change_pdf_settings_on_pad.yaml` / `change_cbz_settings_on_pad.yaml` 在 dev-client 下能过是因为只验证页码变化，但内容同样是旋转的；建议在 release / EAS build 中重新校准。
11. **Dev Launcher 改用 dev-client deep link 连接 Metro**：`dismiss_dev_launcher.yaml` 检测到 "DEVELOPMENT SERVERS" 后，直接使用 `exp+my-reader-mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081` 打开 dev build，不再需要展开 "Enter URL manually" 或点击无 accessible label 的文本框坐标。Android 模拟器跑之前必须先执行 `adb reverse tcp:8081 tcp:8081`（部分模拟器镜像的 `10.0.2.2` 不可达，会报 `ENETUNREACH`）。首次运行前请在 shell 中 `source e2e/.env.local` 以读取 `MAESTRO_DRIVER_STARTUP_TIMEOUT`、`APP_ID`；跑 `@visual` flow 时还需 `MAESTRO_CLOUD_API_KEY`。
12. **截图统一输出到 `e2e/.artifacts/`**：`e2e/config.yaml` 已配置 `testOutputDir: e2e/.artifacts`，运行命令需带 `--config=e2e/config.yaml` 才能生效。该目录已加入 `.gitignore`，`takeScreenshot` 与 AI 截图不会散落在 `my-reader-mobile/` 根目录。`npm run test:e2e:ios` / `test:e2e:android` 脚本也已同步加上 `--config`。
