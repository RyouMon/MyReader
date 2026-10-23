const STATUS_KEYS = {
  idle: "appUpdates.status.idle",
  checking: "appUpdates.status.checking",
  upToDate: "appUpdates.status.upToDate",
  available: "appUpdates.status.available",
  downloading: "appUpdates.status.downloading",
  downloaded: "appUpdates.status.downloaded",
  error: "appUpdates.status.error",
} as const

export function appUpdateMessage(status: string) {
  return STATUS_KEYS[status as keyof typeof STATUS_KEYS] ?? STATUS_KEYS.idle
}

export function appUpdateErrorMessage(error: string | null | undefined) {
  if (error === "UPDATE_UNSUPPORTED_PACKAGE") return "appUpdates.missingPackage"
  if (error === "UPDATE_INTEGRITY_FAILED") return "appUpdates.integrityFailed"
  return "appUpdates.actionFailed"
}
