---
paths:
  - "my-reader/**/*"
---

# Desktop test routing

The maintained test strategy and commands live in [QUALITY.md](../../docs/QUALITY.md).

- Vitest/RTL: public JS behavior and interactions; tests live in `src/**/__tests__/`.
- Cargo: shared business behavior, filesystem/database integration and Tauri adapters.
- Playwright: browser behavior with IPC mocks; retain cleanup through `clearMocks()`.
- WebdriverIO/tauri-driver: native desktop integration on supported Linux/Windows hosts.
  Browser tests do not prove native dialogs, permissions or WKWebView behavior.
- Prefer behavior assertions; no mandatory test file for each component and no pixel/class snapshots.
- Run the full affected package suites. Report unavailable native tests with the command and blocker.
