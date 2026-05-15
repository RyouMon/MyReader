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
npm run test:e2e              # Maestro E2E（runs all flows in e2e/maestro/）
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
npm run test:e2e              # Maestro E2E（runs all flows in e2e/maestro/）
npm run build:dev:android     # EAS local Android build（development profile）
npm run build:dev:ios         # EAS local iOS build（development profile）
```

> **Dev-build E2E 前置条件**：使用 development build 运行 E2E 测试时，需先启动 Expo 开发服务器（`npx expo start`），否则 dev client 会弹出 "Enter URL manually" 提示。

### 架构概述

E2E层采用 **Maestro + BDD** 架构：

- **Feature**（`.feature`）：Gherkin业务规范，人写/人审
- **Step**（`steps/{domain}.yaml`）：GWT定义，`runFlow`调用下层
- **Page / API**（`.yaml`）：Page封装UI定位，API封装后端调用
- **Executable**（`maestro/*.yaml`）：AI生成的可执行Maestro Flow

> **详细规范（目录结构、命名规则、映射算法、转换逻辑、完整示例）见 `maestro-bdd-spec.md`**

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
    flows: ./e2e/maestro
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
| BDD在哪层 | **只在E2E层**，单元测试和导航测试不写BDD |
| 导航测试用BDD吗 | **不用**，`renderRouter` API足够声明式 |
| Step文件组织 | `steps/{domain}.yaml`，内部分`given/when/then`组 |
| Given怎么实现 | 调用API层直接设置状态，不走UI |
| AI做什么 | Feature → Step → Maestro Flow的机械组装 |
| CI首选 | **EAS Workflows**（原生Maestro集成） |
