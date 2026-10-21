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
  const { primary, surface, textMuted } = getThemePalette(mode)
  const indicator = chroma(props.indicatorColor as string)
  const ripple = chroma(props.rippleColor as string)

  // Material also uses the indicator drawable as the ripple's alpha mask.
  expect(indicator.alpha()).toBe(1)
  expect(indicator.hex()).not.toBe(chroma(surface).hex())
  expect(ripple.rgb()).toEqual(chroma(primary).rgb())
  expect(ripple.alpha()).toBeGreaterThan(0)
  expect(props.iconColor).toMatchObject({
    default: textMuted,
    selected: primary,
  })
  expect(props.labelStyle).toMatchObject({
    default: { color: textMuted },
    selected: { color: primary },
  })
  return props
}

it("keeps the native ripple visible and tab foregrounds on the active theme", () => {
  const { rerender } = render(<TabsLayout />)
  const light = expectThemeFeedback("light")

  mockThemeMode = "dark"
  rerender(<TabsLayout />)
  const dark = expectThemeFeedback("dark")
  expect(dark.indicatorColor).not.toBe(light.indicatorColor)
})
