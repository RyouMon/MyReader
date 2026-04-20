# Agent Test Runbook (MyReader Mobile)

## Run Order
1. Install dependencies
2. Run unit tests
3. Build Android/iOS with EAS local profile
4. Run Maestro flows

## Commands

### 1) Install
```bash
cd my-reader-mobile
npm install
```

### 2) Unit tests
```bash
cd my-reader-mobile
npm run test:ci
```

### 3) Local build (no EAS cloud)
```bash
cd my-reader-mobile
npm run e2e:build:android:local
npm run e2e:build:ios:local
```

### 4) Maestro E2E
```bash
cd my-reader-mobile
npm run e2e:maestro:home
npm run e2e:maestro:settings
```

## Notes
- `maestro` must be installed and available in `PATH`.
- The EAS profile used for E2E is `e2e-test` in `my-reader-mobile/eas.json`.
- No `.eas/workflows` is required for this local-only test flow.
