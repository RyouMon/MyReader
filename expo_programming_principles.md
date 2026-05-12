# React Native / Expo 项目编程原则

> 本文件为 AI Agent 在 React Native / Expo 项目中工作的编程准则。遵循这些原则可确保代码的可维护性、可扩展性和性能。

---

## 1. 项目架构与目录结构

### 1.1 采用 Feature-Based（基于功能）的目录结构

- **原则**：按业务功能模块组织代码，而非按文件类型。
- **理由**：功能内聚，便于团队协作，减少合并冲突，新功能可独立开发。
- **推荐结构**：

```
src/
├── app/                      # Expo Router 路由目录（仅放页面）
│   ├── (tabs)/               # Tab 路由组
│   ├── (auth)/               # 认证路由组
│   ├── _layout.tsx           # 根布局
│   └── index.tsx             # 首页
├── features/                 # 功能模块
│   ├── auth/                 # 认证功能
│   │   ├── components/       # 认证相关组件
│   │   ├── hooks/            # 认证相关 Hooks
│   │   ├── services/         # 认证 API 调用
│   │   ├── stores/           # 认证状态管理
│   │   └── types.ts          # 认证相关类型
│   ├── profile/              # 个人资料功能
│   └── settings/             # 设置功能
├── components/               # 全局共享组件（Button, Input 等）
├── hooks/                    # 全局共享 Hooks
├── utils/                    # 纯工具函数（无副作用）
├── constants/                # 全局常量
├── types/                    # 全局类型定义
├── services/                 # 全局 API 客户端、网络层
└── theme/                    # 主题配置
```

- **规则**：
  - `src/app/` 目录**仅用于路由页面**，所有非路由组件必须放在 `src/features/` 或 `src/components/`。
  - 一个功能模块应自包含：组件、Hooks、服务、状态、类型放在同一功能目录下。
  - 跨功能共享的代码提升到 `src/components/`、`src/hooks/`、`src/utils/` 等顶层目录。
  - 功能模块之间不得直接导入，共享代码通过顶层目录或明确的依赖接口。

### 1.2 使用 Expo Router 进行文件系统路由

- **原则**：路由由文件系统自动生成，代码即路由。
- **规则**：
  - 路由文件默认导出页面组件。
  - `_layout.tsx` 用于定义布局，替代传统 `App.tsx`。
  - 路由组（`(tabs)`, `(auth)`）用括号命名，不计入 URL 路径。
  - 路由文件应是**薄包装层**（thin wrapper），业务逻辑委托给 `features/` 中的组件。

---

## 2. 核心设计原则

### 2.1 SOLID 原则在 React Native 中的实践

| 原则 | 在 React Native 中的体现 |
|------|---------------------------|
| **单一职责 (SRP)** | 一个组件/Hook 只负责一件事。数据获取逻辑抽离到自定义 Hook，UI 组件只负责渲染。 |
| **开闭原则 (OCP)** | 通过 Props 和组合扩展组件行为，而非修改现有代码。避免"prop 爆炸"。 |
| **里氏替换 (LSP)** | 子组件替换父组件时行为可预测。Props 应向下兼容，避免引入破坏性变更。 |
| **接口隔离 (ISP)** | 组件不应被迫接受不需要的 Props。拆分臃肿 Props，创建更专注的子组件。 |
| **依赖倒置 (DIP)** | 高层模块依赖抽象而非具体实现。通过自定义 Hooks 和 Context 抽象依赖。 |

### 2.2 DRY — 不要重复自己

- 将重复逻辑提取到自定义 Hooks、工具函数或共享组件中。
- **反模式**：在多个组件中重复相同的 `useEffect` 数据获取逻辑。
- **正模式**：创建 `useAuth()`、`useFetch()` 等可复用 Hook。

### 2.3 KISS — 保持简单愚蠢

- 优先使用 React 内置方案（`useState`、`useReducer`、`Context`），仅在复杂度确实需要时引入外部状态管理库。
- 避免过早抽象。当逻辑在 3 个以上地方重复时，再考虑提取。

---

## 3. 组件设计模式

### 3.1 展示组件 vs 容器组件

- **展示组件（Presentational）**：接收 Props，渲染 UI。无状态或仅有 UI 状态。
- **容器组件（Container）**：负责数据获取、业务逻辑，将数据传递给展示组件。
- **规则**：
  - 页面级组件（Screen）通常是容器组件。
  - 可复用的 UI 元素（Button, Card, Input）是展示组件，放在 `src/components/`。
  - 业务相关组件放在各自功能的 `features/*/components/` 中。

### 3.2 组合优于继承

- **原则**：使用 Props 和 `children` 实现组件扩展，而非修改组件内部代码。
- **规则**：
  - 组件通过 `style` prop 支持外部样式覆盖。
  - 使用 `children` 和 render props 模式实现灵活的内容插槽。
  - 复杂组件拆分为多个小组件组合使用（如 `InputContainer`, `InputLabel`, `Input`）。

### 3.3 自定义 Hooks 规范

- **命名**：以 `use` 开头，清晰描述功能（如 `useAuth`, `useFetchUser`）。
- **单一职责**：一个 Hook 只做一件事。一个文件只导出一个 Hook。
- **组织**：按功能域组织在 `features/*/hooks/` 或 `src/hooks/` 中。
- **规则**：
  - 不在 return 值中包含副作用函数。
  - 使用 TypeScript 明确输入输出类型。
  - 需要时在 Hook 内部使用 `useMemo`、`useCallback` 优化性能。

---

## 4. 状态管理策略

### 4.1 状态分层

| 层级 | 方案 | 适用场景 |
|------|------|---------|
| **本地状态** | `useState`, `useReducer` | 组件级状态：表单输入、开关、临时 UI 状态 |
| **共享状态** | `Context` + `useReducer` | 跨组件低频更新：主题、认证信息、语言设置 |
| **全局状态** | Zustand / Redux Toolkit | 高频更新、复杂数据流：购物车、通知中心 |
| **服务端状态** | TanStack Query (React Query) | 远程数据获取、缓存、分页、自动刷新 |

### 4.2 选择原则

- **优先使用本地状态**：状态能放本地就不提升。
- **Context 用于低频率更新**：主题、认证状态。避免在频繁更新的场景使用 Context（导致大面积重渲染）。
- **全局状态库选择**：
  - **Zustand**：轻量、简单、无样板代码，适合中小型应用。
  - **Redux Toolkit**：大型应用、需要严格数据流和调试能力。
  - **Jotai/Recoil**：需要细粒度响应式状态的原子化方案。
- **服务端状态优先使用 React Query**：自动处理缓存、重试、竞态条件。

### 4.3 状态规范化

- 将嵌套数据扁平化存储，使用 ID 引用实体。
- 避免在状态中存储可由其他状态计算得出的派生数据（使用 selector）。

---

## 5. TypeScript 最佳实践

### 5.1 严格模式配置

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true
  }
}
```

### 5.2 类型规范

- **禁止 `any`**：需要动态类型时使用 `unknown` + 类型守卫。
- **显式 Props 类型**：每个组件定义 Props interface。
- **使用联合类型表示状态**：

```typescript
type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
```

- **使用 `as const` 定义常量**：

```typescript
const THEME_COLORS = {
  primary: '#007AFF',
  secondary: '#5856D6',
} as const;
```

- **类型导入**：使用 `import type` 纯类型导入，减少打包体积。

### 5.3 命名约定

- 接口名使用 PascalCase，不带 `I` 前缀。
- 类型别名使用 PascalCase。
- 泛型参数使用 `T`, `K`, `V` 或具有描述性的名称。

---

## 6. 性能优化原则

### 6.1 渲染优化

- **使用 `React.memo`**：纯展示组件包装 `React.memo` 防止不必要重渲染。
- **使用 `useCallback`**：将回调函数稳定化后传递给子组件。
- **使用 `useMemo`**：缓存昂贵计算结果。
- **状态本地化**：状态尽量靠近使用它的组件，避免不必要的状态提升。

### 6.2 列表优化

- **始终使用 `FlatList` 或 `SectionList`**：大数据集禁止使用 `ScrollView` + `map`。
- **配置关键 Props**：
  - `keyExtractor`：稳定且唯一的 key。
  - `getItemLayout`：固定高度时提供，启用 O(1) 滚动计算。
  - `initialNumToRender`：初始渲染数量保持较小。
  - `windowSize` 和 `maxToRenderPerBatch`：适度配置平衡流畅度与内存。
  - `removeClippedSubviews={true}`：长列表释放屏幕外内存。
- **避免嵌套 FlatList**，改用 `SectionList`。

### 6.3 启动与包体积优化

- **启用 Hermes**：减小包体积，提升启动速度。
- **使用新架构**（Fabric + TurboModules）：降低桥接开销。
- **代码分割**：使用动态 `import()` 按需加载非关键模块。
- **延迟加载**：延迟初始化分析、A/B 测试等非关键 SDK。
- **图片优化**：
  - 使用适当尺寸的图片，避免超大图。
  - 优先使用 WebP/AVIF 格式。
  - 使用 `react-native-fast-image` 实现缓存和懒加载。
  - 使用低质量占位图（LQIP）提升感知性能。

### 6.4 动画优化

- **使用 `react-native-reanimated`**：动画在 UI 线程运行，避免 JS 线程阻塞。
- **Animated API 设置 `useNativeDriver: true`**：支持 transform、opacity、scale 等属性。
- **避免 JS 驱动动画**：会导致卡顿，尤其是列表滚动时。

### 6.5 内存管理

- **清理副作用**：在 `useEffect` 返回的清理函数中取消订阅、清除定时器、释放动画。
- **避免内存泄漏**：不要保留大型数组、图片 blob 的过期引用。
- **InteractionManager**：将非紧急工作延迟到交互完成后执行。

---

## 7. 导航与路由（Expo Router）

### 7.1 基本原则

- **文件即路由**：`src/app/` 下的文件结构自动映射为路由。
- **路由文件是薄包装层**：业务逻辑在 `features/` 中，路由文件只负责渲染。
- **使用路由组**：用 `(tabs)`、`(auth)`、`(modals)` 组织相关路由。
- **布局复用**：使用 `_layout.tsx` 定义共享布局（导航头、Tab 栏等）。

### 7.2 导航模式

- **声明式导航**：使用 `<Link href="/profile" />` 进行跳转。
- **命令式导航**：使用 `useRouter()` 的 `push`、`replace`、`back` 方法。
- **路由参数**：使用 `useLocalSearchParams()` 获取参数，保证类型安全。

### 7.3 路由守卫与认证

- 在布局文件中检查认证状态，未认证用户重定向到登录页。
- 使用 `(auth)` 路由组包裹需要认证的页面。

---

## 8. 错误处理与日志

### 8.1 错误边界（Error Boundaries）

- **必须实现**：使用 `react-native-error-boundary` 或自定义 Error Boundary。
- **分层策略**：
  - 根级别：捕获未处理错误，防止应用崩溃。
  - 功能级别：包裹独立功能模块（如 Dashboard Widgets），局部错误不影响全局。
- **回退 UI**：提供用户友好的错误界面，包含重试按钮。

### 8.2 错误处理模式

- **统一 API 错误处理**：在 API 客户端层使用拦截器统一处理 HTTP 错误。
- **区分用户消息与技术日志**：用户看到友好提示，日志记录详细错误信息。
- **异步错误**：Promise 使用 `try/catch` 或 `.catch()` 捕获。

### 8.3 日志规范

- **分级日志**：`debug`、`info`、`warn`、`error` 四级。
- **结构化日志**：使用 JSON 格式，包含上下文（用户ID、路由、时间戳）。
- **生产环境**：关闭 debug 日志，不输出到控制台。
- **敏感数据**：绝不记录密码、Token、信用卡号等敏感信息。

---

## 9. 测试策略

### 9.1 测试分层

| 类型 | 工具 | 目标 |
|------|------|------|
| **单元测试** | Jest | 测试纯函数、Hooks、工具函数 |
| **组件测试** | React Native Testing Library | 测试组件渲染、用户交互 |
| **集成测试** | Jest + RNTL | 测试多个组件/模块协作 |
| **E2E 测试** | Detox / Maestro | 测试完整用户流程 |

### 9.2 测试原则

- **测试行为而非实现**：关注用户可见的结果，不要测试内部状态。
- **与文件同位置**：测试文件放在被测文件同级目录或 `__tests__/` 子文件夹。
- **Mock 外部依赖**：Native 模块、API 调用、第三方服务全部 Mock。
- **覆盖率目标**：核心逻辑 80%+ 覆盖率。

---

## 10. 样式与主题

### 10.1 NativeWind CSS 优先

- **原则**：**优先使用 NativeWind CSS** 编写样式，`StyleSheet.create` 仅在必要场景下使用。
- **理由**：NativeWind 提供 Tailwind CSS 的全部能力，实现样式一致性、减少样板代码、支持响应式设计和暗色模式。
- **规则**：
  - 所有组件默认使用 `className` 属性编写 Tailwind 类名。
  - 设计令牌通过 `tailwind.config.js` 统一管理，不在组件中硬编码颜色/字号。
  - 复杂布局或需要条件判断的样式，使用 `cn()`（或 `clsx` + `tailwind-merge`）工具函数组合类名。

```tsx
// ✅ 优先：使用 NativeWind
import { View, Text } from 'react-native';
import { cn } from '@/utils/cn';

export function Button({ variant, children }: ButtonProps) {
  return (
    <View className={cn(
      'flex-row items-center justify-center rounded-lg px-4 py-3',
      variant === 'primary' && 'bg-blue-600',
      variant === 'secondary' && 'bg-gray-200'
    )}>
      <Text className="text-base font-semibold text-white">
        {children}
      </Text>
    </View>
  );
}
```

- **`StyleSheet.create` 仅在以下场景使用**：
  - 需要动态计算样式值（如运行时计算的 `width`、`height`、`top` 等数值属性）。
  - 需要 `Animated.Value` 绑定的样式对象。
  - 性能敏感场景且 NativeWind 类名无法覆盖时（罕见）。

```tsx
// ✅ 例外：动态计算或动画场景使用 StyleSheet.create
import { StyleSheet, Animated } from 'react-native';

const animatedValue = new Animated.Value(0);

const styles = StyleSheet.create({
  animatedBox: {
    width: animatedValue.interpolate({ inputRange: [0, 1], outputRange: [100, 200] }),
    opacity: animatedValue,
  },
});
```

- **禁止行内样式对象**：每次渲染创建新对象引用，导致不必要的重渲染。

```tsx
// ❌ 禁止：行内样式对象
<View style={{ flex: 1, justifyContent: 'center' }} />

// ✅ 正确：使用 NativeWind className
<View className="flex-1 justify-center" />
```

### 10.2 主题与暗色模式

- **通过 NativeWind 主题配置**：在 `tailwind.config.js` 中定义 `darkMode: 'class'`，利用 Tailwind 的 `dark:` 前缀。
- **动态主题切换**：结合 React Context 或 App State 切换 `colorScheme`，NativeWind 自动响应。
- **设计令牌（Design Tokens）**：颜色、字体、间距通过 `tailwind.config.js` 的 `theme.extend` 统一定义，而非散落在组件中。

```js
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#007AFF',
        'primary-dark': '#0A84FF',
      },
    },
  },
};
```

```tsx
// 自动支持暗色模式
<Text className="text-gray-900 dark:text-white">
  Hello World
</Text>
```

### 10.3 响应式设计与平台适配

- **使用 Tailwind 响应式前缀**：`md:`, `lg:` 处理不同屏幕尺寸。
- **平台差异化**：使用 `ios:` 和 `android:` 前缀（NativeWind 支持），或保留 `.native.tsx` / `.ios.tsx` / `.android.tsx` 平台后缀文件。
- **字体缩放**：NativeWind 的 `text-sm`, `text-base`, `text-lg` 等工具类配合 `PixelRatio` 处理不同屏幕密度。

---

## 11. 可访问性与国际化

### 11.1 可访问性（a11y）

- **必须支持**：
  - 所有交互元素添加 `accessibilityLabel` 和 `accessibilityHint`。
  - 支持屏幕阅读器（VoiceOver / TalkBack）。
  - 确保颜色对比度符合 WCAG 标准。
  - 支持键盘导航（焦点管理）。

### 11.2 国际化（i18n）

- **使用 `react-i18next`**：翻译键值管理，支持复数、插值。
- **翻译文件按功能组织**：`features/auth/locales/en.json`。
- **使用语义化键名**：`auth.login.button.title` 而非 `"Login"`。
- **RTL 支持**：布局支持从右到左语言（阿拉伯语、希伯来语）。
- **预留翻译空间**：UI 布局预留 30% 文本扩展空间。

---

## 12. Expo 项目特有原则

### 12.1 SDK 与库管理

- **优先使用 Expo SDK**：Expo 提供的库经过兼容性测试，优先使用（`expo-camera`、`expo-location` 等）。
- **安装方式**：使用 `npx expo install <package>` 确保版本兼容。
- **评估第三方库**：检查是否支持新架构（Fabric/TurboModules），查看维护状态和社区活跃度。

### 12.2 环境管理

- **环境变量**：使用 `EXPO_PUBLIC_` 前缀的环境变量，按环境（dev/staging/prod）分离配置。
- **构建配置**：使用 `app.config.ts` / `eas.json` 管理不同环境的构建配置。

### 12.3 原生模块

- **优先使用 Expo Modules API**：需要原生功能时，使用 Expo 的模块 API 而非直接编写原生代码。
- **Development Build**：使用 `expo-dev-client` 替代 Expo Go 进行开发，支持原生模块调试。

---

## 13. 代码质量与协作

### 13.1 代码规范

- **使用 ESLint + Prettier**：统一代码风格，自动格式化。
- **Husky + lint-staged**：提交前自动运行 lint 和类型检查。
- **TypeScript 严格模式**：开启所有严格检查选项。

### 13.2 代码审查清单

- [ ] 组件是否遵循单一职责原则？
- [ ] 是否有不必要的重渲染风险？（是否使用了 memo/useCallback）
- [ ] 类型是否完整，没有 `any`？
- [ ] 副作用是否正确清理？
- [ ] 是否有适当的错误处理？
- [ ] 测试是否覆盖了核心逻辑？
- [ ] 是否有内存泄漏风险？

### 13.3 文档与注释

- **组件文档**：复杂组件使用 JSDoc 注释说明 Props 和用途。
- **README**：每个功能模块包含 README 说明职责和使用方式。
- **避免冗余注释**：代码应自解释，注释说明"为什么"而非"做什么"。

---

## 14. 安全原则

- **敏感信息**：不在代码中硬编码 API Key、Secret。使用环境变量 + 密钥管理服务。
- **数据传输**：使用 HTTPS，证书固定（Certificate Pinning）防止中间人攻击。
- **本地存储**：敏感数据使用 `expo-secure-store` 而非 AsyncStorage。
- **输入验证**：所有用户输入在客户端和服务端双重验证。
- **深度链接安全**：验证 deep link 参数，防止未授权跳转。

---

*本文档基于 React Native 新架构（Fabric + TurboModules）、Expo SDK 52+、TypeScript 5.x 编写。随着框架演进，定期回顾和更新本文件。*
