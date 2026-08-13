import * as Sentry from "@sentry/react-native"

import { applyDiagnosticsPreference } from "./sentry"

jest.mock("@/src/config/diagnostics", () => ({
  SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
}))

jest.mock("@sentry/react-native", () => ({
  breadcrumbsIntegration: jest.fn(() => ({ name: "Breadcrumbs" })),
  close: jest.fn(() => Promise.resolve()),
  init: jest.fn(),
}))

describe("diagnostic sharing", () => {
  beforeEach(async () => {
    await applyDiagnosticsPreference(false)
    jest.clearAllMocks()
  })

  it("should initialize Sentry with data-minimizing options only after consent", async () => {
    await applyDiagnosticsPreference(true)
    await applyDiagnosticsPreference(true)

    expect(Sentry.init).toHaveBeenCalledTimes(1)
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@example.ingest.sentry.io/1",
        attachScreenshot: false,
        attachViewHierarchy: false,
        enableAutoSessionTracking: false,
        enableAutoPerformanceTracing: false,
        enableCaptureFailedRequests: false,
        enableLogs: false,
        maxBreadcrumbs: 0,
        sendClientReports: false,
        sendDefaultPii: false,
      }),
    )
    expect(Sentry.breadcrumbsIntegration).toHaveBeenCalledWith({
      console: false,
      dom: false,
      fetch: false,
      history: false,
      sentry: false,
      xhr: false,
    })

    const options = jest.mocked(Sentry.init).mock.calls[0]?.[0]
    const event = options?.beforeSend?.(
      {
        breadcrumbs: [{ message: "private context" }],
        event_id: "event",
        request: { url: "https://private.example.com" },
        type: undefined,
        user: { email: "reader@example.com" },
      },
      {},
    )
    expect(event).toEqual(
      expect.objectContaining({
        breadcrumbs: undefined,
        request: undefined,
        user: undefined,
      }),
    )
  })

  it("should close Sentry when consent is withdrawn", async () => {
    await applyDiagnosticsPreference(true)
    jest.clearAllMocks()

    await applyDiagnosticsPreference(false)

    expect(Sentry.close).toHaveBeenCalledTimes(1)
  })
})
