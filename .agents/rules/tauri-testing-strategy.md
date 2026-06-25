---
paths:
  - "my-reader/**/*"
---

# Tauri + React Application Testing Strategy

> This document defines the full testing strategy, technology choices, and execution rules for Tauri + React projects.
> All agents implementing features, refactors, or test additions must follow these rules.

---

## 1. Test Layer Architecture (5 Layers)

The project uses a five-layer test architecture. Each layer has its own stack, responsibility boundary, and coverage goal. Do not blur layer responsibilities—for example, do not test Tauri desktop native APIs in the Playwright E2E layer.

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: E2E full-stack integration                         │
│  Tools: WebdriverIO + tauri-driver + Cucumber                │
│  Goal: Validate critical flows in a real Tauri desktop env  │
│  Scope: Window ops, full IPC chain, file dialogs, OS notif.  │
│  Coverage: Few critical paths (sign-in, core business)      │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: E2E frontend                                       │
│  Tools: IPC Mock + Playwright + playwright-bdd + Cucumber    │
│  Goal: Validate frontend behavior; cover most of the UI      │
│  Scope: Rendering, interaction, routing, form validation     │
│  Coverage: Nearly all UI scenarios (no Tauri native APIs)    │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Backend integration                                │
│  Tools: cargo test + tauri::test (mock_app / mock_builder)   │
│  Goal: Validate Tauri commands and backend collaboration     │
│  Scope: Command handlers, state injection, multi-module I/O  │
│  Location: src-tauri/tests/ (single integration binary       │
│            tests/integration.rs; subtree mirrors src/commands)│
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Backend unit tests                                 │
│  Tools: cargo test + #[cfg(test)]                            │
│  Goal: Test pure Rust business logic                         │
│  Scope: Services, repos, utilities, discrete features         │
│  Location: Inline modules in source files                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Frontend unit tests                                │
│  Tools: Vitest + React Testing Library                       │
│  Goal: Test pure JS/TS frontend logic                       │
│  Scope: Utils, hooks, component render, user events           │
│  Location: src/**/__tests__/*.test.{ts,tsx}                  │
└─────────────────────────────────────────────────────────────┘
```

### Layer responsibility boundaries (mandatory)

| Scenario | Use this layer | Do not use |
|----------|----------------|------------|
| React component render & interaction | Layer 1 (Vitest+RTL) | Layer 4/5 |
| Rust pure functions / business logic | Layer 2 (cargo test) | Layer 3 |
| Tauri command handlers | Layer 3 (tauri::test) | Layer 2 |
| Frontend without real backend | Layer 4 (Playwright+IPC Mock) | Layer 5 |
| Real Tauri desktop environment | Layer 5 (WebdriverIO+tauri-driver) | Layer 4 |
| File dialogs / system notifications | Layer 5 | Layer 4 |

---

## 2. Technology choices (decided; do not change)

The following choices were evaluated for community maturity, ease of use, and Tauri compatibility and are fixed. Agents must not swap tools without project approval.

| Layer | Tool | Version constraint | Rationale |
|-------|------|-------------------|-----------|
| Frontend unit | **Vitest** + @testing-library/react | Vitest 4.x | ~5.7M weekly downloads, 98% State of JS retention, shares Vite config |
| DOM env | **jsdom** | 29.x | Stable in project; works well with Tauri API mocks |
| Rust unit/integration | **cargo test** + tauri::test | Tauri 2.x | Official, zero extra setup |
| IPC mock (frontend) | **@tauri-apps/api/mocks** | with @tauri-apps/api | Official; v2.7.0+ supports shouldMockEvents |
| E2E frontend | **Playwright** + playwright-bdd | Playwright 1.60+ | ~33M weekly downloads; playwright-bdd 1100+ stars |
| E2E integration | **WebdriverIO** + @wdio/tauri-service | WebdriverIO 9+ | Tauri’s recommended E2E path |
| BDD | **Cucumber.js** | latest | ~1.89M weekly downloads; Gherkin industry standard |
| Visual regression (optional) | **Chromatic** + Storybook | latest | Component VRT reference |
| a11y (optional) | **vitest-axe** + eslint-plugin-jsx-a11y | latest | Multi-layer coverage |
| CI/CD | **GitHub Actions** | latest | tauri-action support |
| Rust coverage | **cargo-llvm-cov** | latest | LLVM instrumentation; Codecov-friendly |
| Frontend coverage | **@vitest/coverage-v8** | latest | Native V8 coverage, fast |

### Key constraints (agents must follow)

1. **Playwright is frontend-only**: Playwright E2E runs in a browser context, not the Tauri WebView. Do not call `window.__TAURI__` native APIs or assert desktop-only behavior (window management, OS notifications, etc.) in Playwright. Those belong in Layer 5.

2. **No real macOS E2E for tauri-driver**: tauri-driver does not support macOS (no WKWebView WebDriver from Apple). In CI, desktop E2E runs only on `ubuntu-latest` and `windows-latest`. macOS is covered by Rust unit/integration tests plus Playwright (Layer 4).

3. **BDD on two tracks**: Both E2E layers use Cucumber + Gherkin, independently:
   - Layer 4 (Playwright): `playwright-bdd` generates Playwright specs; keep Playwright runner benefits (trace, parallel).
   - Layer 5 (WebdriverIO): `@wdio/cucumber-framework` with `framework: 'cucumber'`.

4. **IPC mocks must be cleared**: Every test using `mockIPC()` must call `clearMocks()` in `afterEach` to avoid state leakage.

---

## 3. Directory layout

When creating tests, follow this layout and naming.

```
my-reader/
│
├── src/                            # Frontend source
│   ├── components/
│   │   └── Button/
│   │       ├── Button.tsx          # Implementation
│   │       └── __tests__/
│   │           └── Button.test.tsx # Co-located unit tests (Layer 1)
│   ├── hooks/
│   │   ├── useLibrary.ts
│   │   └── __tests__/
│   │       └── useLibrary.test.ts  # Hook unit tests (Layer 1)
│   ├── lib/
│   │   ├── cover.ts
│   │   └── __tests__/
│   │       └── cover.test.ts       # Util unit tests (Layer 1)
│   ├── stores/
│   │   ├── dataSourceStore.ts
│   │   └── __tests__/
│   │       └── dataSourceStore.test.ts  # Store unit tests (Layer 1)
│   ├── __mocks__/
│   │   └── setup.ts                # Vitest global setup
│   └── utils/
│       └── format.ts
│
├── src-tauri/                      # Rust backend
│   ├── src/
│   │   ├── main.rs                 # Entry (minimal)
│   │   ├── lib.rs                  # Lib entry + command registration
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── greet.rs            # #[cfg(test)] mod tests (Layer 2)
│   │   │   └── file.rs
│   │   └── utils.rs
│   ├── tests/
│   │   ├── integration.rs          # Single integration-test entry (mod common; mod commands;)
│   │   ├── common/
│   │   │   ├── mod.rs              # Re-exports app/config/ipc/calibre fixtures
│   │   │   ├── app.rs              # TestApp builder over tauri::test::mock_builder
│   │   │   ├── config.rs           # Seed/read AppConfig JSON fixtures
│   │   │   ├── ipc.rs              # invoke_ok / invoke_err helpers
│   │   │   └── calibre.rs          # Minimal Calibre metadata.db fixture
│   │   ├── commands/               # Mirrors src/commands/*.rs
│   │   │   ├── mod.rs              # pub mod book_test; pub mod cache_test; …
│   │   │   ├── book_test.rs        # Tests for src/commands/book.rs
│   │   │   ├── cache_test.rs
│   │   │   ├── download_test.rs
│   │   │   ├── library_test.rs
│   │   │   ├── progress_test.rs
│   │   │   ├── reader_test.rs
│   │   │   ├── source_test.rs
│   │   │   └── sync_test.rs
│   │   └── export_bindings.rs      # Separate binary: regenerates TS bindings
│   └── Cargo.toml
│
├── e2e-frontend/                   # E2E frontend (Layer 4)
│   ├── playwright.config.ts
│   ├── fixtures/
│   │   └── test-data.ts
│   ├── features/                   # Gherkin feature files
│   │   ├── settings.feature
│   │   └── smoke.feature
│   ├── step-definitions/           # Cucumber step definitions
│   │   ├── common-steps.ts
│   │   └── settings-steps.ts
│   └── pages/                      # Page Object Model
│       ├── MainPage.ts
│       └── SettingsPage.ts
│
├── e2e/                            # E2E integration (Layer 5)
│   ├── wdio.conf.ts
│   ├── features/                   # Gherkin feature files
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
│       └── ci.yml                  # CI/CD pipeline
│
├── package.json
├── vitest.config.ts                # Vitest config
├── playwright.config.ts            # Deprecated; use e2e-frontend/
└── tsconfig.json
```

### Naming conventions

| File type | Pattern | Example | Location |
|-----------|---------|---------|----------|
| Frontend unit | `*.test.{ts,tsx}` | `cover.test.ts` | `src/**/__tests__/` |
| Frontend integration | `*.integration.test.ts` | `ipc.integration.test.ts` | under `src/` |
| Rust unit | inline `#[cfg(test)] mod tests` | — | inside source files |
| Rust integration | `<file>_test.rs` under `tests/commands/`, wired via `tests/integration.rs` | `library_test.rs` | `src-tauri/tests/commands/` |
| E2E frontend feature | `*.feature` | `settings.feature` | `e2e-frontend/features/` |
| E2E frontend steps | `*-steps.ts` | `settings-steps.ts` | `e2e-frontend/step-definitions/` |
| E2E desktop feature | `*.feature` | `critical-path.feature` | `e2e/features/` |
| E2E desktop steps | `*-steps.ts` | `window-steps.ts` | `e2e/step-definitions/` |
| Shared Rust test utils | `common/mod.rs` | `tests/common/mod.rs` | `src-tauri/tests/common/` |

---

## 4. Coding standards

### 4.1 Frontend unit tests

```typescript
// ✅ Good example
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockIPC } from '@tauri-apps/api/mocks'
import { SettingsForm } from '../SettingsForm'

// 1. describe block: name of component/function under test
describe('SettingsForm', () => {
  // 2. it() descriptions in natural language: "should ..."
  it('should render all form fields', () => {
    render(<SettingsForm />)
    expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('should submit form data via IPC on save', async () => {
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

  // 3. Cover error paths
  it('should show an error when IPC fails', async () => {
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

### 4.2 Rust tests

> **Privacy policy (hybrid)**: Private free-function unit tests (private helpers, parsers, normalizers) live inline in `#[cfg(test)] mod tests` next to the production code — Rust's natural unit-test home. Command-layer and cross-module integration tests live under `src-tauri/tests/` and go through `tauri::test::mock_builder()` like the production IPC boundary. **Do not move private-helper tests just to mirror `src/` structure under `tests/`; do not widen visibility (`pub(crate)` → `pub`) purely so an integration test can name a private item.** If a test needs to reach private state, route it through a command call.
>
> **Naming**: integration test functions follow `unit_under_test_should_expected_behavior_when_condition`.
>
> **Layout**: a single integration binary at `tests/integration.rs` does `mod common; mod commands;`. Cargo auto-compiles only top-level `tests/*.rs`, so files under `tests/commands/*_test.rs` and `tests/common/*.rs` are reached *only* via `mod` declarations from the entry — one link product, one shared fixture tree.

```rust
// src-tauri/src/commands/greet.rs
use tauri::State;
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    counter: i32,
}

/// Greet command
#[tauri::command]
pub fn greet(name: &str, state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.counter += 1;
    Ok(format!("Hello, {}! Count: {}", name, state.counter))
}

// ─── Unit tests (inline in source file) ───────
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

### 4.3 Gherkin feature files

```gherkin
# e2e-frontend/features/settings.feature
# Layer 4: Playwright E2E — frontend component behavior
@regression @settings
Feature: Settings Page

  Background:
    Given the user is on the settings page

  @smoke
  Scenario: Display current library management UI
    Then the page heading should show "Library management"
    And the add library button should be visible

# e2e/features/critical-path.feature
# Layer 5: WebdriverIO E2E — real Tauri environment
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

### 4.4 Step definitions

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

## 5. Agent execution rules

### 5.1 Mandatory checklist for new features

When adding any feature (components, hooks, commands, APIs, etc.):

```
□ Layer 1: Frontend unit tests
  - New component → add __tests__/*.test.tsx next to it
  - New hook → add __tests__/*.test.ts next to it
  - New util → add __tests__/*.test.ts next to it
  - Components calling IPC → use mockIPC() from @tauri-apps/api/mocks

□ Layer 2: Rust unit tests
  - New pure functions → #[cfg(test)] mod tests in the same file
  - Changed functions → update matching tests

□ Layer 3: Rust integration (new/changed commands)
  - New command → add/update tests under src-tauri/tests/
  - State involved → verify injection and side effects

□ Layer 4: E2E frontend (new/changed UI flows)
  - New page/flow → feature under e2e-frontend/features/
  - Changed flows → update matching features and steps

□ Layer 5: E2E integration (only when desktop-native behavior is involved)
  - Windows / file dialogs / notifications → feature under e2e/features/
  - Pure frontend → Layer 5 not required
```

### 5.2 Coverage expectations

| Phase | Frontend coverage | Rust coverage | E2E scope |
|-------|-------------------|----------------|-----------|
| MVP | 30–50% | 30–50% | Critical paths only (Layer 5) |
| Validation | 50–70% | 50–70% | Core features (Layer 4+5) |
| Production | 70–80% | 70–80% | Full regression suite |
| Enterprise | 80–90% | 80–90% | Full + security audits |

**Gates (validation phase)**:
- `lines`: >= 70%
- `functions`: >= 65%
- `branches`: >= 60%
- `statements`: >= 70%

**Gates (production)**:
- `lines`: >= 80%
- `functions`: >= 75%
- `branches`: >= 70%
- `statements`: >= 80%

### 5.3 Forbidden practices

1. **Do not call real Tauri APIs from Playwright**: Playwright runs in a browser; `window.__TAURI__` is not available. Use IPC mocks or test pure frontend logic only.

2. **Do not omit `clearMocks()`**: Every test run that uses `mockIPC()` must end with `clearMocks()` in `afterEach`. Project `setup.ts` should do this once for all tests; do not add redundant per-file `afterEach` cleanup for the same concern.

3. **Do not rely on `setup()` in Rust tests for state**: `setup()` runs at `run()` time; after `build()`, inject state manually with `app.manage()`.

4. **Do not depend on test order in E2E**: Every feature/scenario must run standalone; never replace Given steps with shared mutable state.

5. **Do not test desktop-native behavior in Layer 4**: Window management, file dialogs, OS notifications → Layer 5 only.

6. **Do not mix `fireEvent` and `userEvent` arbitrarily**: Prefer `userEvent.setup()`; use `fireEvent` only for rare edge cases.

7. **Do not issue real network calls in frontend unit tests**: Mock HTTP with MSW or `vi.mock()`.

---

## 6. Quick reference

### New React component
```bash
# Files
src/components/NewComp/NewComp.tsx
src/components/NewComp/__tests__/NewComp.test.tsx   # ← create together

# Cover: render, interaction, IPC mock if applicable
```

### New Tauri command
```bash
# Files
src-tauri/src/commands/new_command.rs       # include #[cfg(test)] mod tests
src-tauri/tests/commands_integration_test.rs # ← if state / cross-module
```

### New frontend page
```bash
# Files
src/pages/NewPage.tsx
e2e-frontend/features/new-page.feature           # ← if important page
e2e-frontend/step-definitions/new-page-steps.ts  # ← matching steps
```

### New desktop-native feature (e.g. file dialog)
```bash
# Files
e2e/features/file-dialog.feature    # ← Layer 5 only
e2e/step-definitions/file-dialog-steps.ts
```

### Run tests by layer
```bash
# Layer 1: frontend unit
npm run test:unit           # all
npm run test:unit -- cover  # file name filter
npm run test:unit:coverage  # with coverage

# Layer 2+3: Rust
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo test --manifest-path src-tauri/Cargo.toml --test commands_integration_test

# Layer 4: Playwright E2E
npm run test:e2e:frontend               # all
npm run test:e2e:frontend -- --grep "@smoke"  # by tag
npm run test:e2e:frontend:ui            # UI mode

# Layer 5: WebdriverIO E2E
npm run test:e2e:desktop    # local (Tauri app build as required)
```

---

## 7. FAQ

**Q: Both Playwright and WebdriverIO use Cucumber—can feature files be shared?**  
A: No. Step definitions differ (Playwright vs WebdriverIO APIs), and scope differs (UI vs desktop-native). Keep features in `e2e-frontend/features/` vs `e2e/features/` per layer.

**Q: `mock_app()` vs `mock_builder()`?**  
A: Prefer `mock_builder()` as the default entry; use `mock_app()` only for quick spikes. `mock_builder()` supports plugins, multiple commands, state injection, etc.

**Q: `STATUS_ENTRYPOINT_NOT_FOUND` on Windows `cargo test --lib`?**  
A: Known Tauri issue (#13419). Tauri links `comctl32` v6, but `cargo test --lib` test binaries do not embed the required Windows application manifest. The same applies to `cargo test --test integration` — the integration binary spins up `tauri::test::mock_builder()` and hits the same manifest gap. We do not add Windows-only manifest workarounds to `src-tauri/build.rs` to keep the build script simple and avoid conflicts with Tauri's own resource manifest. On Windows, run Rust unit *and* integration tests inside **WSL** (or any Linux environment) instead:

```bash
cd my-reader/src-tauri
cargo test --lib
cargo test --test integration
```

Windows native `cargo build` is unaffected and remains the supported way to build the desktop app.

**Q: Does Playwright E2E need the Rust backend running?**  
A: No. Layer 4 starts Vite via `webServer.command: 'npm run dev'` and mocks backend via `mockIPC()`. That separation is the point of Layer 4.

**Q: Coverage thresholds are hard to hit?**  
A: Prioritize core logic and error paths. Exclude: entry (`main.tsx`), `*.d.ts`, configs, pure barrel re-exports, and files under `src/__mocks__/` used only for setup.

**Q: Difference between `src/__mocks__/` and `src/**/__tests__/`?**  
A: `src/__mocks__/` (e.g. `setup.ts`) holds global Vitest setup and shared mock infrastructure. `src/**/__tests__/` holds Layer 1 tests co-located with source. Do not put unit tests under `src/__mocks__/`, and do not put global mock infra under `__tests__/`.

---

> **Version**: 2.2 
> **Based on**: Tauri v2 + React 18 + Vite 6  
> **Last updated**: 2026-06-25
