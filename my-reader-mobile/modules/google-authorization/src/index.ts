import { requireNativeModule } from "expo-modules-core"

type GoogleAuthorizationModule = {
  authorize(
    scopes: string[],
    accountEmail: string | null,
    interactive: boolean,
  ): Promise<string>
  clearToken(accessToken: string): Promise<void>
}

// Load lazily: Google uses AppAuth on iOS and this module is Android-only.
export function googleAuthorization(): GoogleAuthorizationModule {
  return requireNativeModule<GoogleAuthorizationModule>(
    "MyReaderGoogleAuthorization",
  )
}
