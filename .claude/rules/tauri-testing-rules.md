# Tauri + React 应用测试规则

> 本文件定义了 Tauri + React 项目的完整测试策略、技术选型与执行规范。
> 所有 Agent 在实施功能开发、代码重构或测试补充时，必须遵循本文件的规则。

---

## 1. 测试分层架构（5层）

项目采用五层测试架构，每层有独立的技术栈、职责边界和覆盖目标。禁止混淆各层的职责——例如，禁止在 Playwright E2E 层测试 Tauri 桌面原生 API。

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: E2E 前后端整合测试                                  │
│  工具: WebdriverIO + tauri-driver + Cucumber                 │
│  目的: 验证真实 Tauri 桌面环境中的关键功能                      │
│  范围: 窗口操作、IPC 全链路、文件对话框、系统通知                │
│  覆盖: 少量关键路径（用户登录、核心业务流程）                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: E2E 前端层测试                                      │
│  工具: IPC Mock + Playwright + playwright-bdd + Cucumber     │
│  目的: 验证前端组件行为，覆盖几乎所有界面                       │
│  范围: 组件渲染、用户交互、路由导航、表单验证                   │
│  覆盖: 几乎所有 UI 场景（不涉 Tauri 桌面原生 API）              │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: 后端集成测试                                        │
│  工具: cargo test + tauri::test (mock_app / mock_builder)    │
│  目的: 验证 Tauri Command 及后端服务层协作                     │
│  范围: Command handler、State 注入、多模块联调                 │
│  位置: src-tauri/tests/                                      │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: 后端单元测试                                        │
│  工具: cargo test + #[cfg(test)]                             │
│  目的: 测试 Rust 纯业务逻辑                                   │
│  范围: Service 层、Repo 层、工具函数、离散功能                  │
│  位置: 源文件内联模块                                         │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: 前端单元测试                                        │
│  工具: Vitest + React Testing Library                        │
│  目的: 测试前端纯 JS/TS 逻辑                                  │
│  范围: 工具函数、Hooks、组件渲染、用户事件                      │
│  位置: src/**/__tests__/*.test.{ts,tsx}                      │
└─────────────────────────────────────────────────────────────┘
```

### 各层职责边界（强制规则）

| 场景 | 应使用的层级 | 不应使用的层级 |
|------|------------|--------------|
| 测试 React 组件渲染和交互 | Layer 1 (Vitest+RTL) | Layer 4/5 |
| 测试 Rust 纯函数/业务逻辑 | Layer 2 (cargo test) | Layer 3 |
| 测试 Tauri Command handler | Layer 3 (tauri::test) | Layer 2 |
| 测试前端组件脱离后端 | Layer 4 (Playwright+IPC Mock) | Layer 5 |
| 测试真实 Tauri 桌面环境 | Layer 5 (WebdriverIO+tauri-driver) | Layer 4 |
| 测试文件对话框/系统通知 | Layer 5 | Layer 4 |

---

## 2. 技术选型（已决策，禁止更改）

以下技术选型经过社区成熟度、易用性和 Tauri 兼容性评估，已确定。Agent 在实施测试时不得擅自更换工具。

| 层级 | 工具 | 版本约束 | 选型依据 |
|------|------|---------|---------|
| 前端单元测试 | **Vitest** + @testing-library/react | Vitest 4.x | 周下载 570 万，State of JS 留存率 98%，与 Vite 共享配置 |
| DOM 环境 | **jsdom** | 29.x | 项目已稳定运行，与 Tauri API mocks 兼容良好 |
| Rust 单元/集成测试 | **cargo test** + tauri::test | Tauri 2.x | 官方内置，零配置 |
| IPC Mock（前端） | **@tauri-apps/api/mocks** | 随 @tauri-apps/api | 官方维护，v2.7.0+ 支持 shouldMockEvents |
| E2E 前端层 | **Playwright** + playwright-bdd | Playwright 1.60+ | 周下载 3300 万，社区领导者；playwright-bdd 1100+ Stars |
| E2E 整合层 | **WebdriverIO** + @wdio/tauri-service | WebdriverIO 9+ | Tauri 官方唯一推荐 E2E 方案 |
| BDD 框架 | **Cucumber.js** | 最新 | 周下载 189 万，Gherkin 行业标准 |
| 视觉回归（可选） | **Chromatic** + Storybook | 最新 | 组件级 VRT 标杆 |
| a11y 测试（可选） | **vitest-axe** + eslint-plugin-jsx-a11y | 最新 | 多层覆盖 |
| CI/CD | **GitHub Actions** | 最新 | tauri-action 官方支持 |
| Rust 覆盖率 | **cargo-llvm-cov** | 最新 | LLVM 插桩，与 Codecov 兼容 |
| 前端覆盖率 | **@vitest/coverage-v8** | 最新 | V8 原生覆盖，速度优势 |

### 关键约束（Agent 必须遵守）

1. **Playwright 仅测试前端行为**：Playwright E2E 层在浏览器环境中运行，不涉及 Tauri WebView。禁止在 Playwright 测试中调用 `window.__TAURI__` 原生 API 或验证桌面特性（窗口管理、系统通知等）。这些场景归属 Layer 5。

2. **macOS 不进行真实 E2E**：tauri-driver 不支持 macOS（Apple 未提供 WKWebView WebDriver）。CI 矩阵中 E2E 仅执行 `ubuntu-latest` 和 `windows-latest`。macOS 测试通过后端的单元/集成测试 + 前端 Playwright 层覆盖。

3. **BDD 双轨制**：两层 E2E 都使用 Cucumber + Gherkin，但各自独立：
   - Layer 4（Playwright）：使用 `playwright-bdd` 生成 Playwright spec，保留 Playwright runner 优势（trace、parallel）
   - Layer 5（WebdriverIO）：使用 `@wdio/cucumber-framework`，`framework: 'cucumber'` 原生集成

4. **IPC Mock 必须清理**：每个使用 `mockIPC()` 的测试必须在 `afterEach` 中调用 `clearMocks()`，防止状态泄漏。

---

## 3. 目录结构

Agent 在创建测试文件时，必须遵循以下目录布局和命名规范。

```
my-reader/
│
├── src/                            # 前端源码
│   ├── components/
│   │   └── Button/
│   │       ├── Button.tsx          # 组件实现
│   │       └── __tests__/
│   │           └── Button.test.tsx # 同模块单元测试 (Layer 1)
│   ├── hooks/
│   │   ├── useLibrary.ts
│   │   └── __tests__/
│   │       └── useLibrary.test.ts  # Hook 单元测试 (Layer 1)
│   ├── lib/
│   │   ├── cover.ts
│   │   └── __tests__/
│   │       └── cover.test.ts       # 工具函数单元测试 (Layer 1)
│   ├── stores/
│   │   ├── dataSourceStore.ts
│   │   └── __tests__/
│   │       └── dataSourceStore.test.ts  # Store 单元测试 (Layer 1)
│   ├── __mocks__/
│   │   └── setup.ts                # Vitest 全局 setup
│   └── utils/
│       └── format.ts
│
├── src-tauri/                      # Rust 后端
│   ├── src/
│   │   ├── main.rs                 # 入口（最小化）
│   │   ├── lib.rs                  # 库入口 + command 注册
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── greet.rs            # 含 #[cfg(test)] mod tests (Layer 2)
│   │   │   └── file.rs
│   │   └── utils.rs
│   ├── tests/
│   │   ├── common/
│   │   │   └── mod.rs              # 共享测试辅助函数
│   │   └── commands_integration_test.rs  # 集成测试 (Layer 3)
│   └── Cargo.toml
│
├── e2e-frontend/                   # E2E 前端层 (Layer 4)
│   ├── playwright.config.ts
│   ├── fixtures/
│   │   └── test-data.ts
│   ├── features/                   # Gherkin feature 文件
│   │   ├── settings.feature
│   │   └── smoke.feature
│   ├── step-definitions/           # Cucumber step definitions
│   │   ├── common-steps.ts
│   │   └── settings-steps.ts
│   └── pages/                      # Page Object Model
│       ├── MainPage.ts
│       └── SettingsPage.ts
│
├── e2e/                            # E2E 整合层 (Layer 5)
│   ├── wdio.conf.ts
│   ├── features/                   # Gherkin feature 文件
│   │   ├── critical-path.feature
│   │   └── window-management.feature
│   ├── step-definitions/
│   │   ├── common-steps.ts
│   │   ├── window-steps.ts
│   │   └── file-dialog-steps.ts
│   └── pages/
│       ├── DashboardPage.ts
│       └── LoginPage.ts
│
├── .github/
│   └── workflows/
│       └── ci.yml                  # CI/CD 流水线
│
├── package.json
├── vitest.config.ts                # Vitest 配置
├── playwright.config.ts            # 已废弃，配置在 e2e-frontend/ 内
└── tsconfig.json
```

### 命名规范

| 文件类型 | 命名模式 | 示例 | 位置 |
|---------|---------|------|------|
| 前端单元测试 | `*.test.{ts,tsx}` | `cover.test.ts` | `src/**/__tests__/` |
| 前端集成测试 | `*.integration.test.ts` | `ipc.integration.test.ts` | `src/` 下 |
| Rust 单元测试 | 内联 `#[cfg(test)] mod tests` | - | 源文件内部 |
| Rust 集成测试 | `*_test.rs` 或 `*_integration_test.rs` | `commands_integration_test.rs` | `src-tauri/tests/` |
| E2E Frontend feature | `*.feature` | `settings.feature` | `e2e-frontend/features/` |
| E2E Frontend steps | `*-steps.ts` | `settings-steps.ts` | `e2e-frontend/step-definitions/` |
| E2E Desktop feature | `*.feature` | `critical-path.feature` | `e2e/features/` |
| E2E Desktop steps | `*-steps.ts` | `window-steps.ts` | `e2e/step-definitions/` |
| 共享 Rust 测试工具 | `common/mod.rs` | `tests/common/mod.rs` | `src-tauri/tests/common/` |

---

## 4. 配置模板

Agent 在初始化或修改测试配置时，以以下模板为基准。

### 4.1 Vitest 配置 (vitest.config.ts)

```typescript
import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "src/__mocks__/setup.ts")],
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
    ],
    exclude: ["node_modules/", "e2e-frontend/", "e2e/"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "node_modules/",
        "src/__mocks__/",
        "src/main.tsx",
        "**/*.d.ts",
        "**/*.config.*",
      ],
      thresholds: {
        lines: 70,
        functions: 65,
        branches: 60,
        statements: 70,
      },
    },
  },
})
```

> **覆盖率阈值说明**：当前项目处于验证阶段，暂设保守阈值（lines 70%）。随着测试补充再逐步提升至生产级（lines 80%）。

### 4.2 Vitest Setup 文件 (src/__mocks__/setup.ts)

```typescript
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { clearMocks } from '@tauri-apps/api/mocks'

afterEach(() => {
  cleanup()
  clearMocks()
})

// WebCrypto polyfill（Tauri 核心依赖）
if (typeof crypto === 'undefined') {
  Object.defineProperty(global, 'crypto', {
    value: {
      getRandomValues: (arr: Uint8Array) =>
        require('node:crypto').randomFillSync(arr),
    },
  })
}

// Tauri 内部桥接对象 mock
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  value: {},
  writable: true,
})
```

### 4.3 Cargo.toml 测试配置

```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["rt-multi-thread", "sync", "fs"] }

[dev-dependencies]
tauri = { version = "2", features = ["test"] }
tokio = { version = "1", features = ["full"] }
```

### 4.4 Playwright + playwright-bdd 配置

```typescript
// e2e-frontend/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'

const testDir = defineBddConfig({
  features: './features/**/*.feature',
  steps: './step-definitions/**/*.ts',
})

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'e2e-frontend/reports/report.json' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    baseURL: 'http://localhost:5173',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

### 4.5 WebdriverIO + Cucumber 配置

```typescript
// e2e/wdio.conf.ts
import fs from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const webServerPort = 55173
const webDriverPort = 9515
const previewServerHost = "localhost"
const edgeDriverBinaryPath = path.resolve(projectRoot, "msedgedriver.exe")

let webServerProcess: ReturnType<typeof spawn> | undefined
let edgeDriverProcess: ReturnType<typeof spawn> | undefined

function stopProcessTree(processRef: ReturnType<typeof spawn> | undefined) {
  if (!processRef?.pid) return
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", `${processRef.pid}`, "/T", "/F"], {
      stdio: "ignore", shell: true,
    })
    return
  }
  processRef.kill()
}

function ensureFoliateEpubStub() {
  const foliateDir = path.resolve(projectRoot, "node_modules/my-reader-tools/src/foliate-js")
  const epubEntry = path.join(foliateDir, "epub.js")
  if (fs.existsSync(epubEntry)) return
  fs.mkdirSync(foliateDir, { recursive: true })
  fs.writeFileSync(epubEntry, `export class EPUB {}\nexport default EPUB;\n`, "utf8")
}

function ensureEdgeDriverBinary() {
  if (fs.existsSync(edgeDriverBinaryPath)) return
  const result = spawnSync("msedgedriver-tool", [], { cwd: projectRoot, stdio: "inherit", shell: true })
  if (result.status !== 0 || !fs.existsSync(edgeDriverBinaryPath)) {
    throw new Error("failed to download msedgedriver binary")
  }
}

async function waitForPreviewServerReady() {
  const url = `http://${previewServerHost}:${webServerPort}`
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error("preview server did not become ready")
}

async function startPreviewServer() {
  webServerProcess = spawn(
    "npm", ["run", "preview", "--", "--port", `${webServerPort}`, "--host", previewServerHost, "--strictPort"],
    { cwd: projectRoot, stdio: [null, process.stdout, process.stderr], shell: true },
  )
  await waitForPreviewServerReady()
}

function startEdgeDriver() {
  edgeDriverProcess = spawn(
    edgeDriverBinaryPath, [`--port=${webDriverPort}`],
    { stdio: [null, process.stdout, process.stderr], shell: true },
  )
}

function cleanupProcesses() {
  stopProcessTree(webServerProcess)
  stopProcessTree(edgeDriverProcess)
  webServerProcess = undefined
  edgeDriverProcess = undefined
}

export const config = {
  host: "127.0.0.1", port: webDriverPort, path: "/",
  baseUrl: `http://${previewServerHost}:${webServerPort}`,
  specs: ["./features/**/*.feature"],
  maxInstances: 1,
  capabilities: [{ maxInstances: 1, browserName: "MicrosoftEdge" }],
  reporters: ["spec"],
  framework: "cucumber",
  cucumberOpts: {
    require: ["./step-definitions/**/*.ts"],
    timeout: 120000, strict: true, retry: 1, retryTagFilter: /@flaky/,
  },
  connectionRetryCount: 0,
  onPrepare: async () => {
    cleanupProcesses()
    ensureFoliateEpubStub()
    ensureEdgeDriverBinary()
    const build = spawnSync("npm", ["run", "build:frontend:e2e"], { cwd: projectRoot, stdio: "inherit", shell: true })
    if (build.status !== 0) throw new Error("frontend build failed")
    startEdgeDriver()
    await startPreviewServer()
  },
  onComplete: () => { cleanupProcesses() },
}
```

> **关于 `tauri-driver` 的过渡说明**：当前 Layer 5 配置使用 EdgeDriver + Vite preview server，属于浏览器环境测试。规则要求 Layer 5 最终应使用 `tauri-driver` 驱动真实 Tauri 应用（`browserName: 'tauri'` + `tauri:options`）。由于 `tauri-driver` 接入需要额外的 Tauri 应用构建和 capabilities 调整，建议分阶段实施：先完成 Cucumber 框架升级，后续迭代接入 `tauri-driver`。

### 4.6 GitHub Actions CI/CD 流水线

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  CARGO_TERM_COLOR: always

jobs:
  # ─── Lint ─────────────────────────────────────
  lint-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { components: rustfmt, clippy }
      - uses: swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - run: cargo fmt --check --manifest-path src-tauri/Cargo.toml
      - run: cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features
        env: { RUSTFLAGS: "-Dwarnings" }

  lint-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  # ─── Unit Tests ────────────────────────────────
  test-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev
      - run: cargo test --manifest-path src-tauri/Cargo.toml --workspace

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: npm }
      - run: npm ci
      - run: npm test

  # ─── E2E Frontend (Playwright) ─────────────────
  test-e2e-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium webkit
      - run: npm run test:e2e:frontend
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e-frontend/playwright-report/

  # ─── E2E Desktop (WebdriverIO) ─────────────────
  test-e2e-desktop:
    strategy:
      fail-fast: false
      matrix:
        platform: [ubuntu-latest, windows-latest]  # macOS 不支持 tauri-driver
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - if: matrix.platform == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev webkit2gtk-driver xvfb
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: npm }
      - run: npm ci
      - run: cargo build --manifest-path src-tauri/Cargo.toml
      - if: matrix.platform == 'ubuntu-latest'
        run: xvfb-run npm run test:e2e:desktop
      - if: matrix.platform == 'windows-latest'
        run: npm run test:e2e:desktop

  # ─── Security Audit ────────────────────────────
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo install cargo-audit
      - run: cargo audit --manifest-path src-tauri/Cargo.toml
      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: npm }
      - run: npm audit --audit-level=moderate
```

### 4.7 package.json 脚本

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "npm run test:unit && npm run test:e2e",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:unit:coverage": "vitest run --coverage",
    "test:e2e": "npm run test:e2e:frontend && npm run test:e2e:desktop",
    "test:e2e:frontend": "npx playwright test",
    "test:e2e:frontend:ui": "npx playwright test --ui",
    "test:e2e:desktop": "cd e2e && npx wdio run wdio.conf.ts",
    "build:frontend:e2e": "vite build"
  }
}
```

---

## 5. 编码规范

### 5.1 前端单元测试规范

```typescript
// ✅ 正确示例
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockIPC } from '@tauri-apps/api/mocks'
import { SettingsForm } from '../SettingsForm'

// 1. describe 块命名：被测组件/函数名
describe('SettingsForm', () => {
  // 2. it 描述用自然语言，"应当..."
  it('应渲染所有表单字段', () => {
    render(<SettingsForm />)
    expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('保存时应通过 IPC 提交表单数据', async () => {
    const user = userEvent.setup()
    const mockSave = vi.fn().mockResolvedValue({ success: true })
    mockIPC((cmd) => {
      if (cmd === 'save_settings') return mockSave()
    })

    render(<SettingsForm />)
    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ username: 'testuser' }))
  })

  // 3. 错误路径必须覆盖
  it('IPC 调用失败时应显示错误信息', async () => {
    const user = userEvent.setup()
    mockIPC((cmd) => {
      if (cmd === 'save_settings') throw new Error('Network error')
    })

    render(<SettingsForm />)
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
    })
  })
})
```

### 5.2 Rust 测试规范

```rust
// src-tauri/src/commands/greet.rs
use tauri::State;
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    counter: i32,
}

/// 问候命令
#[tauri::command]
pub fn greet(name: &str, state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.counter += 1;
    Ok(format!("Hello, {}! Count: {}", name, state.counter))
}

// ─── 单元测试（源文件内联）─────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use tauri::test::{mock_builder, mock_context, noop_assets};

    fn create_test_app() -> tauri::App<tauri::test::MockRuntime> {
        let app = mock_builder()
            .invoke_handler(tauri::generate_handler![greet])
            .build(mock_context(noop_assets()))
            .expect("failed to build app");
        app.manage(Mutex::new(AppState::default()));
        app
    }

    #[test]
    fn test_greet_with_name_returns_greeting() {
        let app = create_test_app();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build().unwrap();

        tauri::test::assert_ipc_response(
            &window,
            tauri::webview::InvokeRequest {
                cmd: "greet".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: serde_json::json!({ "name": "World" }).into(),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
            Ok("Hello, World! Count: 1"),
        );
    }
}
```

### 5.3 Gherkin Feature 文件规范

```gherkin
# e2e-frontend/features/settings.feature
# Layer 4: Playwright E2E —— 前端组件行为
@regression @settings
Feature: Settings Page

  Background:
    Given the user is on the settings page

  @smoke
  Scenario: Display current library management UI
    Then the page heading should show "书库管理"
    And the add library button should be visible

# e2e/features/critical-path.feature
# Layer 5: WebdriverIO E2E —— 真实 Tauri 环境
@critical @desktop
Feature: Application Critical Path

  @smoke
  Scenario: Launch and verify main window
    When the application launches
    Then the main window should be visible
    And the window title should be "MyReader"

  @file-dialog
  Scenario: Open file dialog and select a file
    When the user clicks the Open File button
    And the user selects "document.pdf" from the file dialog
    Then the selected file path should be displayed
```

### 5.4 Step Definitions 规范

```typescript
// e2e-frontend/step-definitions/settings-steps.ts
import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'

const { Given, When, Then } = createBdd()

Given('the user is on the settings page', async ({ page }) => {
  await page.goto('/settings')
})

When('the user selects {string} from the theme dropdown', async ({ page }, theme: string) => {
  await page.getByRole('combobox', { name: /theme/i }).selectOption(theme)
})

Then('the page background should be dark', async ({ page }) => {
  const bg = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  )
  expect(bg).toBe('rgb(18, 18, 18)')
})
```

---

## 6. Agent 执行规则

### 6.1 新增功能时的强制检查清单

Agent 在实现任何新功能（包括新增组件、Hook、Command、API 等）时，必须按以下清单执行：

```
□ Layer 1: 前端单元测试
  - 新组件 → 同模块添加 __tests__/*.test.tsx
  - 新 Hook → 同模块添加 __tests__/*.test.ts
  - 新工具函数 → 同模块添加 __tests__/*.test.ts
  - IPC 调用组件 → 使用 @tauri-apps/api/mocks 的 mockIPC()

□ Layer 2: Rust 单元测试
  - 新纯函数 → 源文件内添加 #[cfg(test)] mod tests
  - 修改现有函数 → 更新对应测试

□ Layer 3: Rust 集成测试（如新增/修改 Command）
  - 新 Command → src-tauri/tests/ 添加或更新集成测试
  - 涉及 State → 验证状态注入和副作用

□ Layer 4: E2E 前端层（如新增/修改 UI 流程）
  - 新页面/流程 → e2e-frontend/features/ 添加 feature 文件
  - 更新现有流程 → 同步更新对应 feature 和 steps

□ Layer 5: E2E 整合层（仅涉及桌面原生功能时）
  - 涉及窗口/文件对话框/通知 → e2e/features/ 添加 feature
  - 纯前端功能 → 不需要 Layer 5
```

### 6.2 覆盖率要求

| 项目阶段 | 前端覆盖率 | Rust 覆盖率 | E2E 覆盖范围 |
|---------|-----------|------------|-------------|
| MVP | 30-50% | 30-50% | 仅关键路径（Layer 5） |
| 验证阶段 | 50-70% | 50-70% | 核心功能（Layer 4+5） |
| 生产级 | 70-80% | 70-80% | 完整回归套件 |
| 企业级 | 80-90% | 80-90% | 全量 + 安全审计 |

**门禁规则（验证阶段）**：
- `lines`: >= 70%
- `functions`: >= 65%
- `branches`: >= 60%
- `statements`: >= 70%

**门禁规则（生产级）**：
- `lines`: >= 80%
- `functions`: >= 75%
- `branches`: >= 70%
- `statements`: >= 80%

### 6.3 禁止事项

Agent 在编写测试时禁止以下行为：

1. **禁止在 Playwright 测试中调用真实 Tauri API**：Playwright 运行在浏览器中，`window.__TAURI__` 不存在。必须使用 IPC Mock 或只测试纯前端逻辑。

2. **禁止遗漏 clearMocks()**：每个使用 `mockIPC()` 的测试文件必须在 `afterEach` 中调用 `clearMocks()`。setup.ts 已统一处理，测试文件中不再单独处理。

3. **禁止在 Rust 测试中依赖 setup() 回调**：`setup()` 仅在 `run()` 时执行，`build()` 后需手动 `app.manage()` 注入状态。

4. **禁止 E2E 测试依赖测试顺序**：每个 feature/scenario 必须独立可运行，禁止用状态共享替代 Given 步骤。

5. **禁止在 Layer 4 测试桌面原生特性**：窗口管理、文件对话框、系统通知等只归 Layer 5。

6. **禁止混合使用 fireEvent 和 userEvent**：统一使用 `userEvent.setup()`，仅在特殊边界场景使用 `fireEvent`。

7. **禁止在前端单元测试中引入真实网络请求**：HTTP 调用必须 mock，使用 MSW 或 `vi.mock()`。

---

## 7. 快速参考卡片

### 新增 React 组件
```bash
# 文件
src/components/NewComp/NewComp.tsx
src/components/NewComp/__tests__/NewComp.test.tsx   # ← 必须同时创建

# 测试内容：渲染、交互、IPC mock（如涉及）
```

### 新增 Tauri Command
```bash
# 文件
src-tauri/src/commands/new_command.rs       # 含 #[cfg(test)] mod tests
src-tauri/tests/commands_integration_test.rs # ← 如涉及 State/跨模块
```

### 新增前端页面
```bash
# 文件
src/pages/NewPage.tsx
e2e-frontend/features/new-page.feature           # ← 如为重要页面
e2e-frontend/step-definitions/new-page-steps.ts  # ← 对应 steps
```

### 新增桌面原生功能（文件对话框等）
```bash
# 文件
e2e/features/file-dialog.feature    # ← Layer 5 only
e2e/step-definitions/file-dialog-steps.ts
```

### 运行特定层级测试
```bash
# Layer 1: 前端单元
npm run test:unit           # 全部
npm run test:unit -- cover  # 单个文件匹配
npm run test:unit:coverage  # 带覆盖率

# Layer 2+3: Rust 测试
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo test --manifest-path src-tauri/Cargo.toml --test commands_integration_test

# Layer 4: Playwright E2E
npm run test:e2e:frontend               # 全部
npm run test:e2e:frontend -- --grep "@smoke"  # 按 tag
npm run test:e2e:frontend:ui            # UI 模式

# Layer 5: WebdriverIO E2E
npm run test:e2e:desktop    # 本地（需编译 Tauri 应用）
```

---

## 8. 常见问题

**Q: Playwright 和 WebdriverIO 都用 Cucumber，Feature 文件可以共用吗？**
A: 不可以。两层 E2E 的 step definitions 实现不同（Playwright API vs WebdriverIO API），且测试范围不同（前端组件 vs 桌面原生）。Feature 文件按 Layer 分别放在 `e2e-frontend/features/` 和 `e2e/features/`。

**Q: mock_app() 和 mock_builder() 怎么选？**
A: 统一使用 `mock_builder()` 作为唯一入口，仅在快速原型验证时用 `mock_app()`。`mock_builder()` 支持插件注册、多 Command、State 注入等完整能力。

**Q: Windows 上 cargo test 报错 STATUS_ENTRYPOINT_NOT_FOUND？**
A: 这是 Tauri 已知问题（#13419）。解决方案：在 `src-tauri/build.rs` 中添加条件性 manifest 嵌入代码，或在 CI 中优先使用 Linux 运行 Rust 测试。

**Q: Playwright E2E 需要 Rust 后端运行吗？**
A: 不需要。Layer 4 的 Playwright E2E 通过 `webServer.command: 'npm run dev'` 启动 Vite dev server，后端逻辑通过 `@tauri-apps/api/mocks` 的 `mockIPC()` 模拟。这是 Layer 4 的核心设计——前端脱离后端独立测试。

**Q: 覆盖率阈值达不到怎么办？**
A: 优先覆盖核心业务逻辑和错误路径。以下模块可排除：入口文件（`main.tsx`）、类型定义（`*.d.ts`）、配置文件、纯重导出（barrel files）、`src/__mocks__/` 目录下的 setup 文件。

**Q: `src/__mocks__/` 和 `src/**/__tests__/` 有什么区别？**
A: `src/__mocks__/`（如 `src/__mocks__/setup.ts`）存放 Vitest 全局 setup、Tauri API mock 封装等测试基础设施文件。`src/**/__tests__/`（如 `src/lib/__tests__/`）存放与源码强关联的 Layer 1 单元测试。Agent 不得将单元测试放在 `src/__mocks__/` 下，也不得将 mock 基础设施放在 `__tests__/` 子目录中。

---

> **版本**: 2.0
> **基于**: Tauri v2 + React 18 + Vite 6
> **最后更新**: 2026-05-13
