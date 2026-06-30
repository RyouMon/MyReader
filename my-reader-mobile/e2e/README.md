# Reader E2E — 阅读设置生效测试

验证 EPUB / CBZ / PDF 三种格式的阅读设置是否即时生效。Flow 按 `maestro-bdd-spec.md` 的 flow/subflow 结构组织；场景描述写在 flow 注释里。规约参考 `features/*.feature`（审核用 spec，非可执行）。

当前依赖预置书库或预置远程数据源的 flow 已统一标记为 `wip`，等待新的外部 fixture 准备方案落地后再恢复默认执行。

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

`config.yaml` 默认排除 `skip`、`wip`。设备/视觉维度用 tag 切分：

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
maestro test --config=e2e/config.yaml e2e/flows/smoke -e APP_ID=$APP_ID

# 单条 WIP flow 调试
maestro test --config=e2e/config.yaml e2e/flows/reader/change_cbz_settings.yaml -e APP_ID=$APP_ID
```

> 截图/AI 素材等测试产物默认输出到 `e2e/.artifacts/`，该目录已加入 `.gitignore`，不会进入版本控制。

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

### 复用 subflow（`common/`，`@skip`）
- `launch_and_prepare.yaml` — `clearState` 启动应用并关闭 dev launcher，回到首页
- `open_reader_by_id.yaml` — 仅 deep link 打开指定 book（`BOOK_ID` env），调用方需先准备好书库数据
- `open_reader_settings.yaml` — 任意 chrome 状态下打开阅读设置面板（隐藏则点中心显出）
- `close_reader_sheet.yaml` — 关闭设置面板，保留 chrome 可见（供页码指示器断言）

## 已知校准点（首次运行需确认）

1. **设置面板内部可达性（已修复）**：根因是 `@gorhom/bottom-sheet` 默认 `accessible=true`，把整个 sheet 容器折叠成 a11y 叶子，导致内部 SegmentPicker/Slider 对 Maestro 和 VoiceOver 均不可见。修复：在 `ReaderSettingsSheet.tsx` 的 `<BottomSheetModal>` 上加 `accessible={false}`，并把原容器的 `accessibilityLabel` 移到 header `<Text>`（仍作为 `settingsSheet` 锚点）。现在文本 tapOn 可正常选中 `黑色`、`从右到左` 等选项。该修复同时消除了真实的 VoiceOver 缺陷。
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
