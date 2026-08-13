import * as Sentry from "@sentry/react-native"

import { SENTRY_DSN } from "@/src/config/diagnostics"

let diagnosticsActive = false

/** Apply the persisted, device-local diagnostic sharing preference. */
export async function applyDiagnosticsPreference(enabled: boolean) {
  const shouldEnable = enabled && Boolean(SENTRY_DSN)
  if (shouldEnable === diagnosticsActive) {
    return
  }

  if (!shouldEnable) {
    diagnosticsActive = false
    await Sentry.close()
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: false,
    sendClientReports: false,
    enableLogs: false,
    enableAutoSessionTracking: false,
    enableAutoPerformanceTracing: false,
    enableCaptureFailedRequests: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    maxBreadcrumbs: 0,
    integrations: [
      Sentry.breadcrumbsIntegration({
        console: false,
        dom: false,
        fetch: false,
        history: false,
        sentry: false,
        xhr: false,
      }),
    ],
    beforeSend(event) {
      return {
        ...event,
        breadcrumbs: undefined,
        request: undefined,
        user: undefined,
      }
    },
  })
  diagnosticsActive = true
}
