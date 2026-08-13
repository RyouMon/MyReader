const configuredSentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim()

/** Public client endpoint embedded in builds that support diagnostic sharing. */
export const SENTRY_DSN = configuredSentryDsn || undefined

export const DIAGNOSTICS_AVAILABLE = Boolean(SENTRY_DSN)
