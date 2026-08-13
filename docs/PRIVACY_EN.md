<div align="right"><a href="./PRIVACY.md">简体中文</a></div>

# Privacy and Data Boundaries

MyReader is a local-first reader. It does not require a MyReader account or depend on an official content or sync server. This document describes the default behavior of the open-source version; third-party builds and modifications may behave differently.

## Data Stored on the Device

- Library registrations, app settings, and reader preferences.
- Device caches, downloaded books, and covers.
- Per-library reading progress, favorites, bookmarks, highlights, notes, and reading history.
- Credentials such as WebDAV passwords and OneDrive tokens, stored with the platform's secure storage and never written to the synchronized sidecar.

## Connections to Third-Party Services

MyReader connects to a third-party service only when the user configures or uses the corresponding feature:

- **WebDAV:** reads or writes library files and sync data on the server supplied by the user.
- **OneDrive:** uses Microsoft sign-in and the Graph API to access directories authorized by the user.
- **Diagnostics (optional and off by default):** official mobile builds configure `EXPO_PUBLIC_SENTRY_DSN`, making Sentry diagnostics available, but error reporting remains off by default. Sentry is initialized and begins sending newly occurring diagnostic events only after the user enables “Share diagnostic information” in Settings. When enabled, reports may include error messages and stacks, the app version, and device or runtime details such as the device model and operating system. The current configuration does not send Sentry Logs, enable Session Replay, or allow the SDK to attach default PII. Turning the switch off stops collection of new Sentry diagnostic events. The switch is unavailable in third-party builds that do not configure a DSN. Sentry is not currently integrated into the desktop app.

A Sentry DSN is a public project endpoint used by clients to submit events. It may be embedded in an app build and is not an administrative credential. `SENTRY_AUTH_TOKEN` is a sensitive build credential used for tasks such as source-map uploads; it is not included in the app or repository.

MyReader currently contains no advertising SDK and uses no separate product analytics or behavioral profiling service. WebDAV providers, Microsoft, and optional Sentry processing are governed by their own privacy policies and account settings.

## User Control

- Removing a library registration does not necessarily delete files from an external or remote source; the confirmation dialog describes the actual scope.
- App-internal MyReader libraries are owned by the app, and deleting one may also delete its complete library container.
- When a data source is deleted, MyReader attempts to remove credentials stored for that source on the device, such as passwords or access tokens. This does not revoke authorization on the third-party service. To revoke access, use the account or authorization-management page provided by that service.

## Questions and Requests

Send privacy questions to [wenslife@outlook.com](mailto:wenslife@outlook.com). Do not attach real books, passwords, tokens, or unredacted databases.
