import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import * as mockReact from "react"
import {
  ActionSheetIOS,
  Pressable as mockPressable,
  Text as mockText,
  TextInput as mockTextInput,
  View as mockView,
} from "react-native"

import { upsertTtsProfile } from "@/src/services/core/tts"
import TtsProviderProfileScreen from "./tts-provider-profile-screen"

const mockRouterBack = jest.fn()
const mockUseScreenHeader = jest.fn((options: unknown) => ({
  options,
  toolbar: null,
}))

jest.mock("expo-router", () => ({
  Stack: { Screen: jest.fn(() => null) },
  router: { back: mockRouterBack },
  useLocalSearchParams: () => ({}),
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("@react-native-menu/menu", () => ({
  MenuView: mockView,
}))

jest.mock("@/src/components", () => ({
  Button: jest.fn(() => null),
  FormFieldSwitch: jest.fn(() => null),
  FormLabeledFieldRow: jest.fn(
    ({ children, label }: { children: mockReact.ReactNode; label: string }) =>
      mockReact.createElement(
        mockView,
        null,
        mockReact.createElement(mockText, null, label),
        children,
      ),
  ),
  ListRow: jest.fn(
    ({
      detail,
      onPress,
      title,
    }: {
      detail?: string
      onPress?: () => void
      title: string
    }) =>
      mockReact.createElement(
        mockPressable,
        { accessibilityLabel: title, accessibilityRole: "button", onPress },
        mockReact.createElement(mockText, null, title),
        detail ? mockReact.createElement(mockText, null, detail) : null,
      ),
  ),
  Screen: jest.fn(({ children }: { children: mockReact.ReactNode }) =>
    mockReact.createElement(mockView, null, children),
  ),
  SectionCard: jest.fn(({ children }: { children: mockReact.ReactNode }) =>
    mockReact.createElement(mockView, null, children),
  ),
  SectionLabel: jest.fn(({ children }: { children: mockReact.ReactNode }) =>
    mockReact.createElement(mockText, null, children),
  ),
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    backgroundSecondary: "#eee",
    border: "#ddd",
    danger: "#b00",
    primary: "#c4622d",
    surface: "#fff",
    text: "#111",
    textMuted: "#666",
  }),
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))

jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: (options: unknown) => mockUseScreenHeader(options),
}))

jest.mock("@/src/navigation/toolbar-action-helpers", () => ({
  createSaveAction: (action: unknown) => action,
}))

jest.mock("@/src/services/core/tts", () => ({
  getTtsConfig: jest.fn(),
  removeTtsProfile: jest.fn(),
  upsertTtsProfile: jest.fn(),
}))

jest.mock("@/tw", () => ({
  Text: mockText,
  TextInput: mockTextInput,
  View: mockView,
}))

describe("TtsProviderProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(upsertTtsProfile).mockResolvedValue({} as never)
  })

  it("adds a provider through type selection and a dedicated form step", () => {
    render(<TtsProviderProfileScreen />)

    expect(screen.getByText("settings.tts.providerTypeSection")).toBeTruthy()
    expect(
      screen.getByRole("button", {
        name: "settings.tts.providerKinds.openAiCompatible",
      }),
    ).toBeTruthy()
    expect(screen.queryByTestId("tts-provider-endpoint")).toBeNull()

    fireEvent.press(
      screen.getByRole("button", {
        name: "settings.tts.providerKinds.openAiCompatible",
      }),
    )

    expect(screen.getByTestId("tts-provider-endpoint")).toBeTruthy()
    expect(screen.getByTestId("tts-provider-model")).toBeTruthy()
    const formHeader = mockUseScreenHeader.mock.calls.at(-1)?.[0] as {
      left?: { onPress: () => void }[]
      title?: string
    }
    expect(formHeader.title).toBe("settings.tts.addOpenAi")

    act(() => formHeader.left?.[0]?.onPress())

    expect(screen.getByText("settings.tts.providerTypeSection")).toBeTruthy()
    expect(screen.queryByTestId("tts-provider-endpoint")).toBeNull()
    expect(mockRouterBack).not.toHaveBeenCalled()
  })

  it("saves the selected OpenAI-compatible audio format", async () => {
    jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation((_options, callback) => callback(3))
    render(<TtsProviderProfileScreen />)

    fireEvent.press(
      screen.getByRole("button", {
        name: "settings.tts.providerKinds.openAiCompatible",
      }),
    )
    fireEvent.press(
      screen.getByRole("button", { name: "settings.tts.audioFormat" }),
    )
    fireEvent.changeText(
      screen.getByTestId("tts-provider-voices"),
      "custom-voice",
    )
    const formHeader = mockUseScreenHeader.mock.calls.at(-1)?.[0] as {
      right?: { onPress: () => void }[]
    }

    act(() => formHeader.right?.[0]?.onPress())

    await waitFor(() =>
      expect(upsertTtsProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({ responseFormat: "flac" }),
        }),
      ),
    )
  })
})
