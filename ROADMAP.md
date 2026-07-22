# MyReader Roadmap

> 跨平台功能规划与支持矩阵总览。按功能域分组，每组按 **Desktop（Tauri）** 与 **Mobile（iOS / Android）**、**格式 / 场景** 分别标注当前状态。

## 图例

| 符号 | 含义 |
|---|---|
| ✅ | 已实现并在 UI 暴露 |
| ⚠️ | 底层已实现或部分可用，但 UI 未暴露 / 平台受限 / 只读 |
| ❌ | 未实现 |
| 🗑️ | 曾在类型或旧代码中存在，已移除 |
| — | 不适用 |

---

## 阅读设置 / Reader Settings

> 覆盖三种格式：**Reflow（EPUB）**、**Fixed（PDF）**、**Fixed（CBZ）**。当 PDF 与 CBZ 支持情况完全相同时，合并为 `PDF/CBZ` 列；否则分列展示。

### 已实现设置

#### 主题 / Theme

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ 8 种预设 | — |
| Mobile iOS | ✅ 8 种预设 | ✅ 通过背景色切换（亮/暗/跟随系统） |
| Mobile Android | ✅ 8 种预设 | ✅ 通过背景色切换（亮/暗/跟随系统） |

- Fixed 格式没有独立的主题面板，但移动端通过「背景」选项提供亮色/暗色/跟随系统切换；Desktop 通过 Fixed 背景色行实现类似效果。

#### 字体 / Font Family

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ⚠️ `serif` / `sans` / `system` [^font-1] | — |
| Mobile iOS | ⚠️ `serif` / `sans` / `system` [^font-1] | — |
| Mobile Android | ⚠️ `serif` / `sans` / `system` [^font-1] | — |

[^font-1]: 当前仅提供三类字体族开关，尚未实现按书籍语言加载对应字体栈（如中文使用 `Noto Serif SC`，英文使用 `Lora`/`Merriweather` 等）。

#### 字号 / Font Size

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ 14–26 px | — |
| Mobile iOS | ✅ 14–28 px | — |
| Mobile Android | ✅ 14–28 px | — |

#### 行距 / Line Height

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ 1.35–2.0 | — |
| Mobile iOS | ✅ 1.4–2.4 | — |
| Mobile Android | ✅ 1.4–2.4 | — |

#### 边距 / Page Margin

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ 0–4（rem 档位） | — |
| Mobile iOS | ✅ 12–36 px | — |
| Mobile Android | ✅ 12–36 px | — |

#### 对齐方式 / Text Alignment

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ `auto` / `justify` / `start` | — |
| Mobile iOS | ✅ `auto` / `justify` / `start` | — |
| Mobile Android | ✅ `auto` / `justify` / `start` | — |

#### 栏数 / Column Count

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ `auto` / `1` / `2` | — |
| Mobile iOS | ✅ `auto` / `1` [^column-1] | — |
| Mobile Android | ✅ `auto` / `1` [^column-1] | — |

[^column-1]: Mobile 不暴露 `2`：手机双栏可读性差，iPad 横屏用 `auto` 即可双栏。

#### 阅读布局 / Reading Layout（分页 / 滚动）

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ `paginate` / `scroll` | ❌ 仅 `paginate` [^layout-1] |
| Mobile iOS | ❌ 仅 `paginate` [^layout-1] | ❌ 仅 `paginate` [^layout-1] |
| Mobile Android | ❌ 仅 `paginate` [^layout-1] | ❌ 仅 `paginate` [^layout-1] |

[^layout-1]: Mobile 未暴露滚动模式；PDF 可通过「翻页方向」切换到纵向滚动，CBZ 因 FXL navigator 限制不支持纵向。

#### 背景色 / Background（Fixed）

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | — | ✅ `black` / `dim` / `paper` |
| Mobile iOS | — | ✅ `auto` / `black` / `white` |
| Mobile Android | — | ✅ `auto` / `black` / `white` [^bg-1] |

[^bg-1]: Android 通过桥接层直接设置 navigator view 背景色，因为 Readium pdfium / image navigator 不原生支持 `backgroundColor` 偏好。

#### 翻页方向 / Page Direction

| 平台 | EPUB | PDF | CBZ |
|---|---|---|---|
| Desktop | — | ⚠️ 影响导航方向，未在设置面板暴露 [^pagedir-1] | — [^pagedir-1] |
| Mobile iOS | — | ✅ `horizontal` / `vertical` | — [^pagedir-1] |
| Mobile Android | — | ✅ `horizontal` / `vertical` | — [^pagedir-1] |

[^pagedir-1]: CBZ 的 FXL navigator 只支持横向分页，设置面板隐藏「翻页方向」；Desktop 未在 Fixed 面板暴露该选项。

#### 阅读方向 / Reading Direction

| 平台 | EPUB | PDF | CBZ |
|---|---|---|---|
| Desktop | ⚠️ 存储在全局偏好，未在 EPUB 面板暴露 [^readingdir-1] | ⚠️ 影响导航方向，未在 Fixed 面板暴露 [^readingdir-1] | ⚠️ 影响导航方向，未在 Fixed 面板暴露 [^readingdir-1] |
| Mobile iOS | — | ✅ `ltr` / `rtl` | ✅ `ltr` / `rtl` |
| Mobile Android | — | ✅ `ltr` / `rtl` | ✅ `ltr` / `rtl` [^readingdir-2] |

[^readingdir-1]: Desktop 阅读方向为隐式行为：`direction`（ltr/rtl）存储在全局 `fixedLayout` 偏好中，影响所有格式的边缘翻页方向，但当前未在阅读设置面板中单独暴露。

[^readingdir-2]: Android CBZ 使用 Readium `ImageNavigatorFragment`，原 navigator 未提供 readingProgression 偏好接口。实现方式：通过反射设置其内部 `R2RTLViewPager.direction` 为 `RTL`/`LTR` 并切换 ViewPager 的 layout direction，同时由 `BaseReaderFragment` 根据阅读方向反转边缘点击映射。

#### 页面布局 / Spread

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ⚠️ FXL EPUB：`auto` / `single` / `double` | ✅ `auto` / `single` / `double` |
| Mobile iOS | — | ✅ `auto` / `never` |
| Mobile Android | — | ❌ 未暴露 picker [^spread-1] |

[^spread-1]: Fixed 页面布局仅 iOS 暴露：`spread` picker 只在 Mobile iOS 设置面板中显示；Mobile Android 当前未暴露。

#### 缩放 / Zoom（Render Scale）

| 平台 | EPUB | PDF | CBZ |
|---|---|---|---|
| Desktop | — | ✅ 0.75–3.0 | — |
| Mobile iOS | — | ❌ | ❌ |
| Mobile Android | — | ❌ | ❌ |

### 未实现但底层已支持

这些设置属于 Readium REP-009 偏好，或产品层面已规划，但当前 UI 未暴露，以控制设置面板复杂度。

#### 滚动模式 / Scroll Mode

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ 已实现（见阅读布局） | ❌ 仅分页 |
| Mobile iOS | ⚠️ 底层支持 | ⚠️ 底层支持（可用翻页方向部分替代） |
| Mobile Android | ⚠️ 底层支持 | ⚠️ 底层支持（可用翻页方向部分替代） |

#### 强制双栏 / `columnCount: 2`

| 平台 | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ⚠️ 底层支持 | — |
| Mobile iOS | ⚠️ 底层支持 | — |
| Mobile Android | ⚠️ 底层支持 | — |

#### 其他排版微调

| 设置项 | EPUB | PDF/CBZ | 未暴露原因 |
|---|---|---|---|
| 字重 `fontWeight` | ⚠️ 底层支持 | — | 需求优先级低 |
| 字间距 `letterSpacing` | ⚠️ 底层支持 | — | 需求优先级低 |
| 词间距 `wordSpacing` | ⚠️ 底层支持 | — | 需求优先级低 |
| 段间距 `paragraphSpacing` | ⚠️ 底层支持 | — | 需求优先级低 |
| 段缩进 `paragraphIndent` | ⚠️ 底层支持 | — | 需求优先级低 |
| 连字符 `hyphens` | ⚠️ 底层支持 | — | 需求优先级低 |
| 合字 `ligatures` | ⚠️ 底层支持 | — | 需求优先级低 |
| 文本规范化 `textNormalization` | ⚠️ 底层支持 | — | 需求优先级低 |
| 图片滤镜 `imageFilter` | ⚠️ 底层支持 | — | 需求优先级低 |
| 字体缩放比例 `typeScale` | ⚠️ 底层支持 | — | 需求优先级低 |
| 竖排文本 `verticalText` | ⚠️ 底层支持 | — | 中日文 EPUB 可能用到，当前未支持 |
| 出版商样式 `publisherStyles` | ⚠️ 底层支持 | — | 当前强制覆盖，保证主题/字体生效；后续可作高级开关 |
| 语言 `language` | ⚠️ 底层支持 | — | 跟随系统语言，未提供单独覆盖 |

### 已移除设置

| 设置项 | 曾在哪 | 移除原因 |
|---|---|---|
| 亮度 `brightness` | Reflow & Fixed 旧 `ReaderSettings` | Readium 没有亮度偏好；旧实现用半透明黑色遮罩叠加，不可靠且影响渲染 |
| 缩放比例 `zoomScale` | Fixed 旧 `ReaderSettings` | Fixed 格式使用原生双指捏合缩放；程序式 `zoomScale` 与 PDFKit/Pinch 冲突 |
| Fixed 主题 `fixed.theme` | Fixed 旧 `ReaderSettings` | FXL/PDF navigator 不支持主题 token，只能用背景色替代 |

---

## 其他功能域 / Other Domains

### 数据存储与同步

架构方向已经由
[ADR-0008](./docs/adr/0008-data-ownership-and-sync-storage.md) 确定；具体用户域协议见
[Profile Sync v1 草案](./docs/sync/profile-v1.md)。

| 阶段 | 状态 | 目标 |
|---|---|---|
| 书库 sidecar 数据库 | ✅ | 进度、书签等书库域数据随书库保存 |
| 书库 v3 增量同步 | ⚠️ | 已同步进度和书签，其他书库域尚未全部接入 |
| 稳定跨设备身份 | ❌ | 引入 `profile_id`、应用级 `device_id`、`library_uuid`、`book_uuid` |
| Profile 数据库 | ❌ | 集中保存跨书库阅读事件、完成历史和全局设置 |
| 旧阅读统计迁移 | ❌ | 将本地 `book_id` 幂等映射为稳定 `book_ref` |
| `profile-v1` 同步 | ❌ | 同步不可约事件，不同步派生统计 |
| 统一同步协调器 | ❌ | 一个产品入口协调 Profile 与全部已连接书库 |
| 多端兼容与恢复验证 | ❌ | 覆盖重复应用、中断恢复、未知协议和删除语义 |

### 其他待补充领域

> 书库管理、TTS、ComfyUI 创意生成等。
