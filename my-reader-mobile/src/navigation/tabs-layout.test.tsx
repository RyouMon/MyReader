import { render } from "@testing-library/react-native"
import chroma from "chroma-js"
import { NativeTabs } from "expo-router/unstable-native-tabs"
import type { ReactNode } from "react"

import TabsLayout from "@/src/app/(tabs)/_layout"
import { getThemePalette } from "@/src/design/tokens"

let mockThemeMode = "light"

jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ settings: { themeMode: mockThemeMode } }),
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("@expo/vector-icons/MaterialIcons", () => () => null)

jest.mock("expo-router/unstable-native-tabs", () => {
  const Trigger = Object.assign(
    ({ children }: { children: ReactNode }) => children,
    { Icon: () => null, VectorIcon: () => null, Label: () => null },
  )
  return {
    NativeTabs: Object.assign(
      jest.fn(({ children }: { children: ReactNode }) => children),
      { Trigger },
    ),
  }
})

function expectThemeFeedback(mode: "light" | "dark") {
  const props = jest.mocked(NativeTabs).mock.calls.at(-1)![0]
  const primary = getThemePalette(mode).primary
  for (const color of [props.indicatorColor, props.rippleColor]) {
    expect(typeof color).toBe("string")
    const feedback = chroma(color as string)
    expect(feedback.rgb()).toEqual(chroma(primary).rgb())
    expect(feedback.alpha()).toBeGreaterThan(0)
    expect(feedback.alpha()).toBeLessThan(1)
  }
}

it("keeps native selection and press feedback on the active theme accent", () => {
  const { rerender } = render(<TabsLayout />)
  expectThemeFeedback("light")

  mockThemeMode = "dark"
  rerender(<TabsLayout />)
  expectThemeFeedback("dark")
})
