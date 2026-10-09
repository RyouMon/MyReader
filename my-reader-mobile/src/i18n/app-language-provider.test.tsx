import { render, screen, waitFor } from "@testing-library/react-native"
import { AppState, Text } from "react-native"

import { changeLanguage } from "."
import { AppLanguageProvider } from "./app-language-provider"

const mockAppState = {
  settings: { language: "en" },
  storeReady: false,
}

jest.mock(".", () => ({
  __esModule: true,
  changeLanguage: jest.fn(() => Promise.resolve()),
  resolveAppLanguage: jest.fn((language: string) => language || "en"),
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

  it("applies a new saved preference after startup", async () => {
    mockAppState.storeReady = true
    const view = render(
      <AppLanguageProvider>
        <Text>App content</Text>
      </AppLanguageProvider>,
    )
    await waitFor(() => expect(screen.getByText("App content")).toBeTruthy())
    mockAppState.settings.language = "ru"
    view.rerender(
      <AppLanguageProvider>
        <Text>App content</Text>
      </AppLanguageProvider>,
    )
    await waitFor(() => expect(changeLanguage).toHaveBeenLastCalledWith("ru"))
  })

  it("refreshes system language on foreground and removes the listener on unmount", async () => {
    mockAppState.storeReady = true
    mockAppState.settings.language = ""
    const remove = jest.fn()
    const subscribe = jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove })
    const view = render(
      <AppLanguageProvider>
        <Text>App content</Text>
      </AppLanguageProvider>,
    )
    await waitFor(() => expect(screen.getByText("App content")).toBeTruthy())
    const onChange = subscribe.mock.calls[0]![1]
    jest.mocked(changeLanguage).mockClear()
    onChange("background")
    expect(changeLanguage).not.toHaveBeenCalled()
    onChange("active")
    await waitFor(() => expect(changeLanguage).toHaveBeenCalledWith("en"))
    view.unmount()
    expect(remove).toHaveBeenCalled()
    subscribe.mockRestore()
  })
})
