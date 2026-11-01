import { act, fireEvent, render } from "@testing-library/react-native"
import { MenuView } from "@react-native-menu/menu"
import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import type { ReadingPlanController } from "@/src/features/reader/tts/use-reading-plan"
import { NarrationReadingPlan } from "./NarrationReadingPlan"

jest.mock("@/tw", () => jest.requireActual("react-native"))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/components", () => ({
  Button: () => null,
  FormSwitch: () => null,
}))
jest.mock("@/src/components/ui/status-badge", () => ({
  StatusBadge: () => null,
}))
jest.mock("@/src/components/ui/platform-icon", () => ({
  PlatformIcon: () => null,
}))
jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({ danger: "red" }),
}))
jest.mock("./ReaderListSelectionControls", () => ({
  ReaderListManagementBar: () => null,
  ReaderListSelectionIndicator: () => null,
}))
jest.mock("@expo/ui/community/bottom-sheet", () => ({
  BottomSheetFlatList: jest.requireActual("react-native").FlatList,
}))
jest.mock("@react-native-menu/menu", () => ({
  MenuView: jest.fn(({ children }) => children),
}))
jest.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Tap: () => {
      const gesture: Record<string, jest.Mock> = {}
      for (const key of [
        "maxDuration",
        "runOnJS",
        "onBegin",
        "onEnd",
        "onFinalize",
      ])
        gesture[key] = jest.fn(() => gesture)
      return gesture
    },
  },
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}))

it("plays on tap and exposes a separate native long-press jump action", () => {
  const plan = {
    entries: [
      {
        id: "entry",
        characterId: "narrator",
        speech: { text: "A paragraph.", instructions: "Calm" },
      },
    ],
    currentIndex: -1,
    play: jest.fn(),
    jump: jest.fn(),
  } as unknown as ReadingPlanController
  const screen = render(
    <NarrationReadingPlan
      plan={plan}
      palette={readerChromePalette("#2C2420", "#F5EFE9")}
    />,
  )
  fireEvent.press(screen.getByText("A paragraph."))
  expect(plan.play).toHaveBeenCalledWith("entry")
  expect(plan.jump).not.toHaveBeenCalled()
  const menu = jest.mocked(MenuView).mock.calls.at(-1)![0]
  expect(menu.shouldOpenOnLongPress).toBe(true)
  expect(menu.actions).toEqual([{ id: "jump", title: "narration.plan.jump" }])
  act(() => menu.onPressAction!({ nativeEvent: { event: "jump" } }))
  expect(plan.jump).toHaveBeenCalledWith("entry")
  expect(plan.play).toHaveBeenCalledTimes(1)
})
