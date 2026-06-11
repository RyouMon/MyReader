export const ONEDRIVE_CLIENT_ID = "9750fea8-e428-4d4d-8956-7738561e14ac"

export const ONEDRIVE_ISSUER = "https://login.microsoftonline.com/common"

// Must use a scheme separate from Expo Router (`myreadermobile://`) so Android
// routes OAuth callbacks to RedirectUriReceiverActivity, not MainActivity.
export const ONEDRIVE_REDIRECT_URL = "ryoumon.myreadermobile.auth://onedrive/"

export const ONEDRIVE_SCOPES = ["openid", "profile", "email", "offline_access", "Files.ReadWrite", "User.Read"]

export const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0"

// SecureStore key prefixes
export const ONEDRIVE_ACCESS_TOKEN_KEY = "ryoumon.myreader.onedrive.accessToken"
export const ONEDRIVE_REFRESH_TOKEN_KEY = "ryoumon.myreader.onedrive.refreshToken"