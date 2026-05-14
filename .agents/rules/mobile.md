---
paths:
  - "my-reader-mobile/**/*"
---

## Architecture

- **Routing**: Expo Router file-based (`app/` directory)
- **State**: Zustand (app-store, data-source-store, library-store, settings-store)
- **Database**: op-sqlite with CR-SQLite enabled
- **Key directories**:
  - `app/` — routes
  - `screen/` — screen components
  - `data/` — data layer (sqlite, calibre, webdav, cache)
  - `sync/` — sync lifecycle management
  - `design/` — design tokens and semantic colors
- **Patches**: 4 patches in `patches/` (react-native, react-native-css, react-native-zip-archive, gradle-plugin). Applied automatically via `postinstall`.

## Commands

All commands are package-specific. The repo root has no `package.json`.

### Mobile (`my-reader-mobile/`)

```bash
cd my-reader-mobile
npm install                   # Installs deps + applies patch-package patches
npx expo start                # Expo dev server
npm run android               # Run on Android (expo run:android)
npm run ios                   # Run on iOS device
npm run lint                  # ESLint (expo lint)
```

**Testing:**
```bash
npm run test:ci               # Jest in CI mode (jest-expo preset)
npm run test                  # Jest watch mode
npm run e2e:maestro:home      # Maestro E2E home flow
npm run e2e:maestro:settings  # Maestro E2E settings flow
npm run e2e:build:android:local   # EAS local Android build (e2e-test profile)
npm run e2e:build:ios:local       # EAS local iOS build (e2e-test profile)
```

## Testing

> **Mobile testing strategy** (four-layer architecture, Maestro E2E, toolchain, run commands): see `.agents/rules/expo-testing-strategy.md`.