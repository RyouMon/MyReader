import { render, screen, waitFor } from "@testing-library/react-native"
import { Text } from "react-native"

import { changeLanguage } from "."
import { AppLanguageProvider } from "./app-language-provider"

const mockAppState = {
  settings: { language: "en" },
  storeReady: false,
}

jest.mock(".", () => ({
  __esModule: true,
  changeLanguage: jest.fn(() => Promise.resolve()),
  resolveAppLanguage: jest.fn((language: string) => language || "zh"),
}))

jest.mock("../store/app-store", () => ({
  useAppStore: jest.fn((selector: (state: typeof mockAppState) => unknown) =>
    selector(mockAppState),
  ),
}))

describe("AppLanguageProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAppState.settings.language = "en"
    mockAppState.storeReady = false
  })

  it("should apply the persisted language before rendering children when the store rehydrates", async () => {
    const view = render(
      <AppLanguageProvider>
        <Text>App content</Text>
      </AppLanguageProvider>,
    )

    expect(screen.queryByText("App content")).toBeNull()
    expect(changeLanguage).not.toHaveBeenCalled()

    mockAppState.storeReady = true
    view.rerender(
      <AppLanguageProvider>
        <Text>App content</Text>
      </AppLanguageProvider>,
    )

    await waitFor(() => {
      expect(changeLanguage).toHaveBeenCalledWith("en")
      expect(screen.getByText("App content")).toBeTruthy()
    })
  })
})
