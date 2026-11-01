import { act, renderHook } from "@testing-library/react-native"
import { useTtsRemovalConfirmation } from "./use-tts-removal-confirmation"
import { getTtsChangeUsage } from "@/src/services/core/tts"
import {
  showAlertWithStatusBarRestore,
  showErrorAlert,
} from "@/src/constants/alert-with-status-bar"

jest.mock("@/src/services/core/tts", () => ({ getTtsChangeUsage: jest.fn() }))
jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
  showErrorAlert: jest.fn(),
}))
jest.mock("@/src/i18n/error-message", () => ({
  errorMessage: (error: Error) => error.message,
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { usages?: string }) => values?.usages ?? key,
  }),
}))

const provider = {
  id: "p",
  kind: "qwen",
  modelScopedVoices: true,
  models: [],
  voices: [],
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getTtsChangeUsage).mockResolvedValue([
    {
      profileId: "a",
      libraryName: "Library",
      scopeName: "Book",
      characterName: "Alice",
    },
  ])
})

it("shows character usage and waits for confirmation; cancel and dismissal do not apply changes", async () => {
  const { result } = renderHook(useTtsRemovalConfirmation)
  let pending!: Promise<boolean>
  await act(async () => {
    pending = result.current(provider, "voice")
  })
  const alert = jest.mocked(showAlertWithStatusBarRestore).mock.calls.at(-1)!
  expect(alert[1]).toContain("Library · Book · Alice")
  act(() => alert[2]!.find((button) => button.style === "cancel")!.onPress?.())
  expect(await pending).toBe(false)
  await act(async () => {
    pending = result.current(provider, "voice")
  })
  act(() =>
    jest
      .mocked(showAlertWithStatusBarRestore)
      .mock.calls.at(-1)![3]!
      .onDismiss?.(),
  )
  expect(await pending).toBe(false)
  await act(async () => {
    pending = result.current(provider, "voice")
  })
  act(() =>
    jest
      .mocked(showAlertWithStatusBarRestore)
      .mock.calls.at(-1)![2]!
      .find((button) => button.style === "destructive")!
      .onPress?.(),
  )
  expect(await pending).toBe(true)
  jest.mocked(showAlertWithStatusBarRestore).mockClear()
  expect(await result.current(provider)).toBe(true)
  expect(showAlertWithStatusBarRestore).not.toHaveBeenCalled()
})

it("blocks destructive edits when the reference check fails", async () => {
  jest.mocked(getTtsChangeUsage).mockRejectedValueOnce(new Error("offline"))
  const { result } = renderHook(useTtsRemovalConfirmation)
  expect(await result.current(provider)).toBe(false)
  expect(showErrorAlert).toHaveBeenCalled()
})
