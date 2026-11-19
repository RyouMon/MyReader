export const GOOGLE_DRIVE_CLIENT_IDS = {
  ios: "679889280827-l7r5uvus691p8ighv14ti401817sts0b.apps.googleusercontent.com",
  android:
    "679889280827-7true64oai4far80me20muvlmu81si1s.apps.googleusercontent.com",
} as const

// Dropbox App Keys are public application identifiers. Set this once for the
// app build; users authenticate with Dropbox and never enter the key.
export const DROPBOX_APP_KEY = "bhqdm55o1hhmbxu"

// Dropbox and OneDrive use the shared AppAuth callback scheme. Google uses its
// reversed client-ID scheme on iOS and Google Identity Services on Android.
export const CLOUD_AUTH_SCHEME = "ryoumon.myreadermobile.auth"
export const DROPBOX_REDIRECT_URL = `${CLOUD_AUTH_SCHEME}://dropbox/`

export const GOOGLE_DRIVE_SCOPES = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/drive",
]

export const DROPBOX_SCOPES = [
  "account_info.read",
  "files.metadata.read",
  "files.metadata.write",
  "files.content.read",
  "files.content.write",
]
