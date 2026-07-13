import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AppearanceSection from "@/components/settings/sections/AppearanceSection"
import i18n from "@/i18n"
import { useAppUiStore } from "@/stores/appUiStore"

vi.mock("@/components/AppThemeProvider", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}))

describe("AppearanceSection", () => {
  beforeEach(async () => {
    useAppUiStore.setState({ appLanguageMode: "system" })
    await i18n.changeLanguage("en")
  })

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
    })
  })

  it("should save English when the English language option is selected", () => {
    render(<AppearanceSection />)

    fireEvent.click(screen.getByText("English"))

    expect(useAppUiStore.getState().appLanguageMode).toBe("en")
  })
})
