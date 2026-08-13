import { render, waitFor } from "@testing-library/react-native"

import { applyDiagnosticsPreference } from "@/src/services/diagnostics/sentry"

import { DiagnosticsRuntime } from "./diagnostics-runtime"

const mockAppState = {
  diagnosticsEnabled: true,
  storeReady: false,
}

jest.mock("@/src/services/diagnostics/sentry", () => ({
  applyDiagnosticsPreference: jest.fn(() => Promise.resolve()),
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: jest.fn((selector) =>
    selector({
      settings: { diagnosticsEnabled: mockAppState.diagnosticsEnabled },
      storeReady: mockAppState.storeReady,
    }),
  ),
}))

describe("DiagnosticsRuntime", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAppState.diagnosticsEnabled = true
    mockAppState.storeReady = false
  })

  it("should wait for persisted consent before applying diagnostics", async () => {
    const view = render(<DiagnosticsRuntime />)

    expect(applyDiagnosticsPreference).not.toHaveBeenCalled()

    mockAppState.storeReady = true
    view.rerender(<DiagnosticsRuntime />)

    await waitFor(() => {
      expect(applyDiagnosticsPreference).toHaveBeenCalledWith(true)
    })
  })

  it("should stop diagnostics when consent is withdrawn", async () => {
    mockAppState.storeReady = true
    const view = render(<DiagnosticsRuntime />)
    await waitFor(() => {
      expect(applyDiagnosticsPreference).toHaveBeenCalledWith(true)
    })

    jest.clearAllMocks()
    mockAppState.diagnosticsEnabled = false
    view.rerender(<DiagnosticsRuntime />)

    await waitFor(() => {
      expect(applyDiagnosticsPreference).toHaveBeenCalledWith(false)
    })
  })
})
