# security-scoped-bookmarks

Apple-only [Expo Module](https://docs.expo.dev/modules/) that bridges iOS/macOS
**security-scoped bookmarks**, so the app can persist access to a user-selected
directory (a Calibre library folder picked via the document picker) across app
launches.

Under Apple's sandbox, access granted through the document picker is **not**
persisted across app restarts by default — the system revokes it over time or
after the process is recycled. To keep reading that folder on the next launch,
the grant must be serialized into a security-scoped bookmark (`bookmarkData`)
and re-resolved + re-started each session. This module wraps that lifecycle —
`bookmarkData`, `URL(resolvingBookmarkData:)`, and
`startAccessingSecurityScopedResource()` / `stopAccessingSecurityScopedResource()`
— behind a small async JS API. See Apple's
[Providing access to directories](https://developer.apple.com/documentation/uikit/providing-access-to-directories)
guide for the underlying behavior.

**Apple platforms only. No Web, no Android.**

## Why this exists

Local Calibre libraries on iOS live outside the app container. The user picks
the library root once; from then on the app must re-establish sandbox access on
every cold start. Without a persisted security-scoped bookmark, every launch
would re-prompt the user (or silently fail to read the library). This module is
the persistence + re-access layer for that flow.

It is intentionally narrow: it only manages bookmark creation, resolution, and
the start/stop access bracket. All Calibre/library logic lives in `domain/`
and consumes this module through the wrapper in
[`src/services/fs/bookmarks.ts`](../../src/services/fs/bookmarks.ts).

## API

Exported from [`index.ts`](./index.ts):

```ts
import SecurityScopedBookmarks, {
  type SecurityScopedBookmarkInfo,
  type ResolveBookmarkResult,
} from '../../../modules/security-scoped-bookmarks';
```

| Function | Signature | Returns |
|---|---|---|
| `createBookmarkForDirectoryAsync` | `(uri: string) => Promise<SecurityScopedBookmarkInfo>` | `{ bookmarkBase64, resolvedUri, stale }` |
| `resolveBookmarkAsync` | `(bookmarkBase64: string) => Promise<ResolveBookmarkResult>` | `{ uri, stale }` |
| `startAccessingBookmarkAsync` | `(bookmarkBase64: string) => Promise<ResolveBookmarkResult>` | `{ uri, stale }` |
| `stopAccessingBookmark` | `(uri: string) => void` | — |

```ts
type SecurityScopedBookmarkInfo = {
  bookmarkBase64: string; // base64-encoded bookmarkData — persist this
  resolvedUri: string;    // absolute URL the bookmark resolves to
  stale: boolean;         // true → bookmark needs recreating
};

type ResolveBookmarkResult = {
  uri: string;
  stale: boolean;
};
```

## Intended consumption

Callers should **not** use the raw module directly. Go through
[`src/services/fs/bookmarks.ts`](../../src/services/fs/bookmarks.ts), which adds
platform gating, stale-bookmark auto-refresh, lifecycle bracketing, and
localized error mapping:

```ts
import {
  createSecurityScopedBookmark,
  withSecurityScopedLibraryAccess,
} from '@/src/services/fs/bookmarks';

// Persist access when the user first picks a library directory.
const bookmark = await createSecurityScopedBookmark(libraryRootUri);
// → store `bookmark` on the Library as `securityScopedBookmark`.

// Re-establish access around any read of the library folder.
const { result, refreshedLibrary } = await withSecurityScopedLibraryAccess(
  library,
  async (resolvedUri) => {
    // read files under resolvedUri here;
    // do NOT return a path for deferred use by other native APIs —
    // copy/read into app-owned storage inside this callback instead.
  }
);
// if `refreshedLibrary` is returned, persist it (the bookmark went stale).
```

Consumers: [`domain/library/calibre.ts`](../../src/domain/library/calibre.ts),
[`domain/library/local-library-content.ts`](../../src/domain/library/local-library-content.ts),
[`domain/sync/db-sync.ts`](../../src/domain/sync/db-sync.ts).

## Native notes

- **Brackets, not tokens.** `startAccessingBookmarkAsync` opens a
  security-scoped access session; the matching `stopAccessingBookmark` must
  close it. The native module tracks live sessions in an
  `activeScopedResources` registry keyed by resolved URL, and stops all of
  them in `OnDestroy`. The wrapper enforces start/stop pairing in a
  `try/finally`.
- **Stale bookmarks.** `URL(resolvingBookmarkData:)` may report `stale: true`
  (e.g. the folder was renamed/moved). The wrapper detects this and recreates
  the bookmark from the resolved URI, returning a `refreshedLibrary` that the
  caller must persist.
- **Creation relies on an existing grant.** `createBookmarkForDirectoryAsync`
  does **not** call `startAccessingSecurityScopedResource` itself — it assumes
  `expo-file-system` already opened (and closed) a scoped-access session while
  producing the directory URI. Call it only with URIs obtained through the
  picker flow, not arbitrary paths.
- **`.minimalBookmark`.** Bookmarks are created with the `minimalBookmark`
  option; they are not tied to a particular app instance and survive reinstalls
  within the same access grant.
- **Errors.** Native failures (`InvalidUriException`,
  `InvalidBookmarkException`, `SecurityScopeAccessException`) are mapped by the
  wrapper to localized Chinese messages under the `securityBookmarks.*` i18n
  namespace, with the original error preserved on `Error.cause`.

## References

Apple's official guidance for obtaining and persisting user-granted directory
access on iOS/iPadOS — this module is a direct bridge over those docs:

- [Providing access to directories](https://developer.apple.com/documentation/uikit/providing-access-to-directories) — obtaining access via the document picker and the access lifecycle.
- [Save the URL as a bookmark](https://developer.apple.com/documentation/uikit/providing-access-to-directories#Save-the-URL-as-a-bookmark) — the section this module implements: persist the granted URL as bookmark data, then resolve + `startAccessingSecurityScopedResource()` on each subsequent access.

Motivating bug: [RyouMon/MyReader#47](https://github.com/RyouMon/MyReader/issues/47) — iOS losing access to user-granted library paths after cold start / process recycling, root-caused to missing bookmark persistence.

## Installation

This is a **local** Expo Module — not a workspace package (no `package.json`,
not listed in `my-reader-mobile/package.json` deps). It is wired in two ways:

- **Native (autolinking):** Expo discovers it via
  [`expo-module.config.json`](./expo-module.config.json)
  (`platforms: ["apple"]`, module class `MyReaderSecurityScopedBookmarks`).
  Rebuild iOS (`expo run:ios`) after native changes; `pod install` runs as part
  of that.
- **JS:** imported by relative path from
  [`src/services/fs/bookmarks.ts`](../../src/services/fs/bookmarks.ts). No
  package alias is registered, so import via the relative path shown above.

The native module class is named `MyReaderSecurityScopedBookmarks` and is
looked up via `requireNativeModule('MyReaderSecurityScopedBookmarks')` — that
runtime name is decoupled from the directory name and is not affected by
directory renames.

## Development

From `my-reader-mobile/`:

```bash
pnpm exec expo run:ios --device <UDID>   # rebuild + run after native changes
pnpm run test:ci                          # Jest (no module-specific tests)
```

There is no dedicated unit-test suite for the native bridge; behavior is
covered end-to-end by the local-library flows under `e2e/flows/`.

## License

MIT, under the project's top-level [`LICENSE`](../../../LICENSE). No third-party
code is vendored in this module.
