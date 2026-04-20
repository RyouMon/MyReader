# MyReader Testing Guide

## Desktop (`my-reader`)

### Install
```bash
cd my-reader
npm install
```

### Full test suite
```bash
cd my-reader
npm test
```
Runs frontend unit tests (Vitest), then E2E (WebdriverIO).

### Frontend unit (Vitest)
```bash
cd my-reader
npm run test:unit
npm run test:unit:watch
```
- Tests: `tests/**/*.test.ts`
- Setup: `tests/setup.ts`

### Rust (`src-tauri`)
```bash
cd my-reader/src-tauri
cargo test
```
- Integration tests: `src-tauri/tests/` (`commands_webdav`, `reading_progress`)

### E2E (WebdriverIO + Edge)
```bash
cd my-reader
npm run test:e2e
```
- Project: `webdriver/webdriverio/` (`wdio.conf.js` starts preview + Edge driver)
- E2E frontend build only (if needed separately): `npm run build:frontend:e2e`

---

## Mobile (`my-reader-mobile`)

### Scope
- Unit tests: Jest (`jest-expo`)
- E2E tests: Maestro
- Build mode: EAS local (`--local`)

### Install
```bash
cd my-reader-mobile
npm install
```

### Unit Testing
```bash
cd my-reader-mobile
npm run test:ci
```

Optional:
```bash
cd my-reader-mobile
npm run test
npm run test:update-snapshots
```

### E2E Testing (Maestro)
Prerequisite: `maestro` CLI must be available in `PATH`.

```bash
cd my-reader-mobile
maestro test .maestro/home.yml
maestro test .maestro/settings.yml
```

Equivalent npm scripts:
```bash
cd my-reader-mobile
npm run e2e:maestro:home
npm run e2e:maestro:settings
```

### EAS Local Build for E2E
Use profile `e2e-test` from `my-reader-mobile/eas.json`.

```bash
cd my-reader-mobile
npx eas-cli@latest build --platform android --profile e2e-test --local
npx eas-cli@latest build --platform ios --profile e2e-test --local
```

Equivalent npm scripts:
```bash
cd my-reader-mobile
npm run e2e:build:android:local
npm run e2e:build:ios:local
```
