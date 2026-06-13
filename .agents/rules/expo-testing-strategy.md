---
paths:
  - "my-reader-mobile/**/*"
---

# Expo React Native 应用测试策略

> **版本**: 1.0  
> **日期**: 2026-05-14  
> **范围**: Expo SDK 52+ / React Native 0.76+  

---

## 一、四层测试模型

```
单元测试（50%）  →  导航集成测试（20%）  →  E2E测试（20%）  →  视觉/a11y测试（10%）
```

| 层级 | 投入 | 核心工具 | 测试目标 | 反馈速度 |
|---|---|---|---|---|
| 单元测试 | 50% | Jest + jest-expo + RNTL | 工具函数、Hooks、组件渲染、业务逻辑 | < 1秒 |
| 导航集成测试 | 20% | expo-router/testing-library | 多屏幕导航、路由参数、认证流程 | 1–5秒 |
| E2E测试 | 20% | Maestro | 完整业务流、原生模块交互 | 5–15分钟 |
| 视觉 / a11y测试 | 10% | Reassure + ESLint | 性能回归、无障碍访问合规 | CI级 |

---

## 二、单元测试层

### 工具栈

```
Jest + jest-expo preset + @testing-library/react-native
```

### 运行命令

```bash
cd my-reader-mobile
npm run test:ci               # Jest in CI mode（jest-expo preset）
npm run test                  # Jest watch mode
npm run test:e2e              # Maestro E2E（runs all flows in e2e/）
npm run build:dev:android     # EAS local Android build（development profile）
npm run build:dev:ios         # EAS local iOS build（development profile）
```

### 核心配置

**jest.config.ts**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)' +
      '|expo(nent)?|@expo(nent)?/.*' +
      '|react-navigation|@react-navigation/.*)',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  coverageThreshold: {
    global: { branches: 75, functions: 80, lines: 80, statements: 80 },
  },
  testTimeout: 10000,
};

export default config;
```

**jest.setup.js**

```javascript
import '@testing-library/react-native/extend-expect';

jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);
```

### 文件组织

单元测试与被测代码并列放置（`*.test.ts` / `*.test.tsx`），不使用顶层 `tests/` 目录。Jest 默认 `testMatch` 即可发现。示例：

```
src/
  store/
    app-store.constants.ts
    app-store.constants.test.ts
  sync/
    download-store.ts
    download-store.test.ts
```

### 编写规则

| 规则 | 说明 |
|---|---|
| 查询优先级 | `getByRole` > `getByLabelText` > `getByText` > `getByTestId` |
| 不测实现细节 | 测行为（用户可见的交互结果），不测内部状态 |
| Mock策略 | 工具函数用jest.fn()，API调用用MSW，原生模块用jest-expo自动mock |
| 覆盖率目标 | 全局80%（分支/函数/行/语句），核心模块85% |

### 组件测试示例

```typescript
import { render, screen, userEvent } from '@testing-library/react-native';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('enables submit button when both fields are filled', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSubmit={jest.fn()} />);

    await user.type(screen.getByLabelText('手机号'), '13800138000');
    await user.type(screen.getByLabelText('验证码'), '123456');

    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled();
  });
});
```

---

## 三、导航集成测试层

### 工具

```
expo-router/testing-library  (renderRouter)
```

### 核心规则

- **不写BDD**：纯技术测试，`renderRouter` API足够声明式，不需要Gherkin
- **覆盖范围**：屏幕间导航、认证流程重定向、Deep Linking、Tab/Drawer布局
- **运行环境**：Node.js，无需构建原生binary
- **文件位置**：`src/app/__tests__/navigation.test.tsx`，与路由入口并列

### 测试示例

```typescript
import { renderRouter, screen } from 'expo-router/testing-library';

describe('auth navigation', () => {
  it('redirects unauthenticated user to login', () => {
    const { router } = renderRouter({
      '(auth)/login': () => <Text>登录</Text>,
      dashboard: () => <Text>仪表盘</Text>,
    }, { initialUrl: '/dashboard' });

    expect(router.pathname).toBe('/login');
  });

  it('allows authenticated user to access protected screen', () => {
    const { router } = renderRouter({
      '(auth)/login': () => <Text>登录</Text>,
      profile: () => <Text>个人中心</Text>,
    }, { initialUrl: '/profile' });

    expect(router.pathname).toBe('/profile');
  });
});
```

---

## 四、E2E测试层

### 选型

| 框架 | Flakiness | Expo官方 | 选型 |
|---|---|---|---|
| Maestro | <1% | 推荐（2024.7起） | **选中** |
| Detox | <2% | 已弃用 | — |
| Appium | 15-20% | 无集成 | — |

### 运行命令

```bash
cd my-reader-mobile
npm run test:e2e              # Maestro E2E（runs all flows in e2e/）
npm run build:dev:android     # EAS local Android build（development profile）
npm run build:dev:ios         # EAS local iOS build（development profile）
```

> **Dev-build E2E 前置条件**：使用 development build 运行 E2E 测试时，需先启动 Expo 开发服务器（`pnpm run start`），否则 dev client 会弹出 "Enter URL manually" 提示。
>
> **Maestro driver 超时**：iOS 首次运行或更新 Maestro 后可能触发 `iOS driver not ready in time`。设置环境变量 `MAESTRO_DRIVER_STARTUP_TIMEOUT=600000` 再运行，必要时删除旧的 Maestro XCTest driver 让其重新安装。
>
> **Deep link 平台差异**：iOS 使用 `myreadermobile://<path>`；Android 使用 `exp+my-reader-mobile://<path>` 并开启 `autoVerify: true`，否则应用已在前台时 deep link 可能丢失路径段。

### 架构概述

E2E层采用 **Maestro flow/subflow** 架构：

- **Flow**（`flows/{domain}/*.yaml`）：可执行测试，按 feature 分组，文件名用动词短语描述用户行为
- **Subflow**（`common/*.yaml`）：被 `runFlow` 引用的复用序列，统一标记 `tags: [skip]`
- **Selector**（`scripts/selectors.js`）：Page Object 脚本，优先用 accessibilityLabel 中英文正则，通过 `runScript` 加载
- **Config**（`config.yaml`）：Maestro workspace 配置，`flows: ["*/**"]` 自动发现所有 flow

> **详细规范（目录结构、命名规则、复用策略、完整示例）见 `maestro-bdd-spec.md`**

### 开发模式本地 E2E 运行流程

开发构建（development build）跑 E2E 时，需要 Metro 和已启动的模拟器同时就绪。按以下顺序执行，**iOS 与 Android 不要同时跑**：

#### 1. 检查并启动 Metro

```bash
cd my-reader-mobile

# 检查 8081 端口是否已有 Metro（任一命令有输出即可）
lsof -Pi :8081 -sTCP:LISTEN
curl -I http://127.0.0.1:8081

# 如果没有输出，启动 Metro
pnpm run start
```

等待 `http://127.0.0.1:8081` 可访问后再继续。

#### 2. 检查并启动模拟器

优先使用已经创建好的模拟器，没有时再创建。

**iOS：**

```bash
# 列出可用模拟器
xcrun simctl list devices available

# 如果已有 Booted 的设备，直接使用；否则启动第一个可用 UDID
xcrun simctl boot <UDID>
open -a Simulator
```

**Android：**

```bash
# 列出已创建的 AVD
emulator -list-avds

# 检查是否有运行中的设备
adb devices

# 如果没有运行中的设备，启动第一个 AVD
emulator -avd <AVD_NAME>
```

> 启动 Android 模拟器后执行 `adb reverse tcp:8081 tcp:8081`，然后在 dev launcher 里输入 `127.0.0.1:8081`（部分模拟器的 `10.0.2.2` 网络不可达）。
>
> 如果 Maestro 提示设备未连接（`Device xxx was requested, but it is not connected`），尝试重启 adb 服务：`adb kill-server && adb start-server`，再重新运行。

#### 3. 安装 development build（如设备上未安装）

`pnpm run ios` / `pnpm run android` 默认会交互式选择设备。为避免卡在选择界面，先查出设备 ID，再通过 `--device` 指定：

**iOS：**

```bash
# 查出目标模拟器的 UDID
xcrun simctl list devices available

# 指定模拟器安装 development build
pnpm exec expo run:ios --device <UDID>
```

**Android：**

```bash
# 列出已创建的 AVD
emulator -list-avds

# 指定模拟器安装 development build（优先使用 AVD 名称）
pnpm exec expo run:android --device <AVD_NAME>
```

如果 `--device <ID>` 匹配失败，可以退回到交互式命令 `pnpm run ios` 或 `pnpm run android` 在模拟器列表中手动选择。

#### 4. 分别运行 E2E

先跑完一个平台，再跑另一个：

```bash
# iOS
MAESTRO_DRIVER_STARTUP_TIMEOUT=600000 pnpm run test:e2e:ios

# Android（等 iOS 结束后再执行）
MAESTRO_DRIVER_STARTUP_TIMEOUT=600000 pnpm run test:e2e:android
```

- iOS 模拟器与 Mac 共享网络，dev-client 自动使用 `127.0.0.1:8081`。
- Android 模拟器通过 `adb reverse tcp:8081 tcp:8081` 后，dev-client 使用 `127.0.0.1:8081`。
- 单条 flow 调试示例：
  `MAESTRO_DRIVER_STARTUP_TIMEOUT=600000 pnpm exec maestro --device emulator-5554 test e2e/flows/reader/read_book.yaml -e APP_ID=ryoumon.myreadermobile`

### CI集成（EAS Workflows）

```yaml
# eas.yml
build:
  type: build
  params:
    profile: development

maestro:
  type: maestro
  params:
    build_id: ${{ steps.build.id }}
    flows: ./e2e
    shards: 4
```

---

## 五、视觉 / a11y测试层

### 可访问性测试

| 工具 | 用法 |
|---|---|
| RNTL `getByRole` / `getByLabelText` | 单元测试中的a11y验证 |
| `eslint-plugin-react-native-a11y` | CI静态检查，零警告门禁 |

### 性能回归测试

```typescript
import { measureRenders } from 'reassure';

it('renders LoginForm within baseline', async () => {
  await measureRenders(<LoginForm onSubmit={jest.fn()} />);
});
```

---

## 六、工具栈总览

| 层级 | 工具 | 版本 | 职责 |
|---|---|---|---|
| 单元测试 | Jest | ^29.7.0 | 测试运行器 |
| 单元测试 | jest-expo | ~55.0.0 | Expo预设配置 |
| 单元测试 | @testing-library/react-native | ^13.3.0 | 组件测试 |
| 单元测试 | MSW | ^2.7.0 | API Mock |
| 导航集成 | expo-router/testing-library | ~55.0.0 | renderRouter |
| E2E | Maestro CLI | latest | E2E执行引擎 |
| E2E | Maestro Cloud | — | CI云执行 |
| 性能 | Reassure | ^1.3.0 | 渲染性能回归 |
| a11y | eslint-plugin-react-native-a11y | ^3.0.0 | 静态a11y检查 |

---

## 七、Mobile 开发命令参考

```bash
cd my-reader-mobile
npm install                   # Installs deps + applies patch-package patches
npx expo start                # Expo dev server
npm run android               # Run on Android（expo run:android）
npm run ios                   # Run on iOS device
npm run lint                  # ESLint（expo lint）
```

---

## 八、关键决策记录

| 决策 | 结论 |
|---|---|
| E2E框架 | **Maestro**（Expo官方推荐，<1% flakiness） |
| BDD在哪层 | **不写BDD**。Maestro 无官方 BDD runner，场景描述直接写在 flow 注释里 |
| 导航测试用BDD吗 | **不用**，`renderRouter` API足够声明式 |
| Flow文件组织 | `flows/{domain}/` 按 feature 分组；`common/` 放复用 subflow |
| 状态怎么设置 | 优先用 deep link 或 seed 路由直接设置状态，不走 UI |
| AI做什么 | 直接编写/修改 Maestro flow 和 common subflow |
| CI首选 | **EAS Workflows**（原生Maestro集成） |
