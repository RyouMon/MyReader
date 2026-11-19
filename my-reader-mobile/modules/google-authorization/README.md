# Google authorization on Android

This local Expo module wraps Google Identity Services `AuthorizationClient`.
Only an explicit sign-in action may launch account selection or consent. Token
renewal selects the source's saved Google account and reports that sign-in is
required if Google needs user interaction. Tokens stay in platform secure storage;
Rust Core receives only the current access token.

Register an Android OAuth client in the same Google Cloud project for each
package name and signing certificate used to distribute the app. Local Expo
builds and production/Play builds normally use different signing certificates.
Inspect the actual APK with `apksigner verify --print-certs app-release.apk`.
The SDK resolves the client from the package and certificate; it does not use a
browser redirect or a client secret. Leave the custom URI scheme option disabled.
The client ID stored in source configuration remains for compatibility with
existing platform records; it does not override native certificate matching.

Google owns the renewable grant. SecureStore keeps the selected account binding
instead of a refresh token; the shared `hasRefreshToken` DTO flag represents that
renewable credential. iOS Google and Dropbox continue to use AppAuth with PKCE.
Removing a source clears its local credentials without revoking the project's
Google grant, which could otherwise disrupt other devices.

References:

- [Android authorization](https://developer.android.com/identity/authorization)
- [OAuth client setup](https://support.google.com/googleapi/answer/6158849)
