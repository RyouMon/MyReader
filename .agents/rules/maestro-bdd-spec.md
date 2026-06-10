---
paths:
  - "my-reader-mobile/**/*"
---

# Maestro E2E 测试规范

> 基于 Maestro 原生能力的 flow/subflow 结构。不再维护 Gherkin `.feature` 文件；场景描述直接写在可执行 flow 的注释里。

## 一、目录结构

```
e2e/
├── config.yaml              # Maestro workspace 配置
├── scripts/
│   └── selectors.js         # 统一 page-object selector map
├── common/                  # 复用 subflow，全部 tag: skip
│   ├── launch_and_prepare.yaml
│   ├── confirm_deep_link.yaml
│   ├── open_settings.yaml
│   └── ...
└── flows/                   # 可执行 Maestro flow，按 feature 分组
    ├── smoke/
    │   └── launch_app.yaml
    ├── settings/
    │   ├── navigate_settings.yaml
    │   ├── browse_webdav.yaml
    │   └── browse_onedrive.yaml
    ├── reader/
    │   └── toggle_reader_chrome.yaml
    └── library/
        └── ...
```

## 二、文件分类

| 类型 | 目录 | tag | 作用 |
|---|---|---|---|
| 可执行 Flow | `flows/{domain}/` | 业务标签（如 `settings`, `smoke`） | 被 Maestro 直接运行 |
| 复用 Subflow | `common/` | `skip` | 通过 `runFlow` 被可执行 flow 引用 |
| 待稳定 Flow | `flows/{domain}/` | `wip` | 暂时跳过，待修复或补全后再启用 |
| Selector 脚本 | `scripts/` | — | 被 `runScript` 加载，集中管理 label 正则（优先）与少量 testID |

## 三、命名规范

### Flow 文件

- 动词开头，snake_case，描述**用户行为或测试目的**；
- 好：`navigate_settings.yaml`, `browse_webdav.yaml`, `launch_app.yaml`, `toggle_reader_chrome.yaml`；
- 差：`modal_root_headers.yaml`（这是状态，不是行为）。

### Subflow 文件

- 动作/状态为中心，snake_case；
- 好：`launch_and_prepare.yaml`, `confirm_deep_link.yaml`, `open_settings.yaml`。

### Selector 脚本

- 使用 `output.selectors = { domain: { ... } }` 结构；
- 按业务域分组，避免散落在 YAML 中的魔法字符串。

## 四、复用策略

**原则：非复用即内联。**

- 只有 ≥2 个可执行 flow 使用的序列，才抽成 `common/*.yaml`；
- 同一个 flow 内部的重复代码直接内联，避免为了复用而制造大量原子 subflow；
- 每个 scenario 尽量自包含，便于单独阅读和调试。

## 五、Flow 文件格式

```yaml
appId: ${APP_ID}
tags:
  - settings
  - navigation
---
# Scenario: 用户能从书库详情返回设置首页
- runFlow: ../../common/launch_and_prepare.yaml
- runFlow:
    when:
      platform: iOS
    commands:
      - openLink: myreadermobile://seed-library
      - runFlow: ../../common/confirm_deep_link.yaml
- runFlow:
    when:
      platform: Android
    commands:
      - openLink: exp+my-reader-mobile://seed-library
      - runFlow: ../../common/confirm_deep_link.yaml
- runFlow: ../../common/open_settings.yaml
- tapOn:
    id: "settings-library-row-seed-Example1"
- runFlow: ../../common/tap_header_back_or_close.yaml
- extendedWaitUntil:
    visible:
      id: "settings-add-library-row"
    timeout: 10000
```

### 多个 scenario

一个 flow 文件内可用 `---` 分隔多个 scenario。当多个场景验证**同一类行为**时（如"设置导航"下的各种页面头部/返回行为），优先合并到同一个 flow。

## 六、Subflow 文件格式

所有 `common/*.yaml` 必须带 `tags: [skip]`，防止 Maestro 直接执行。

```yaml
appId: ${APP_ID}
name: Launch app and dismiss dev launcher
tags:
  - skip
---
- launchApp
# ...
```

### 状态隔离

批量运行多个 flow 时，Maestro 会复用同一个设备 session。为确保每个 flow 都从干净状态开始，公共启动子流程应使用 `clearState: true`：

```yaml
---
- stopApp
- launchApp:
    clearState: true
```

这可以避免上一个 flow 结束时留在深层导航栈，导致下一个 flow 的断言失败。

## 七、Selector 脚本格式

```javascript
output.selectors = {
  tabs: { settings: "设置|Settings" },
  settings: {
    header: { close: "关闭|Close", back: "返回|Back" },
    toolbar: { libraryDelete: "删除书库|Delete Library" },
    rows: { addLibrary: "添加书库|Add Library", webdav: "WebDAV" },
  },
  fixtures: { libraryName: "Example1", webdavSource: "Test WebDAV" },
};
```

在 flow 中使用（**优先 `text` / 字符串 shorthand**，与 Maestro 官方建议一致）：

```yaml
- runScript: ../../scripts/selectors.js
- tapOn: ${output.selectors.tabs.settings}
- assertVisible: ${output.selectors.settings.toolbar.libraryDelete}
```

Selector 值为 **accessibilityLabel / 可见文案** 的中英文正则（`中文|English`），fixture 数据用稳定英文名。仅在原生控件无 label 时保留 `testID`。

## 八、工作流

```
1. 确定要覆盖的行为
        ↓
2. 在 flows/{domain}/ 下新建或修改 flow 文件
        ↓
3. 如需复用序列，检查是否已有 common/*.yaml；没有则新建
        ↓
4. 如需新 selector，添加到 scripts/selectors.js
        ↓
5. 本地运行 maestro test 验证
```

## 九、编辑覆盖策略

| 文件 | 覆盖策略 |
|---|---|
| `flows/*.yaml` | 持续维护，按需增删 scenario |
| `common/*.yaml` | 持续维护，通用子流程变更时同步更新所有调用方 |
| `scripts/selectors.js` | 持续维护，重命名 selector 必须同步更新所有引用 |
| `.feature` | **不再维护**，已删除 |
| `steps/` | **不再维护**，已删除 |

## 十、迁移前结构（归档参考）

旧结构采用 L0/L1/L2 三层 BDD：

```
e2e/
├── features/          # Gherkin .feature
├── steps/             # GWT step YAML
└── maestro/           # 可执行 flow
```

由于 Maestro 没有官方 BDD runner，维护成本过高，已迁移为当前 flow/subflow 结构。
