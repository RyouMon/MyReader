import { act, fireEvent, render, screen, within } from "@testing-library/react"
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

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("option", { name: "English" }))

    expect(useAppUiStore.getState().appLanguageMode).toBe("en")
  })

  it("offers all eleven languages by their native names and saves Russian", () => {
    render(<AppearanceSection />)
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" })
    expect(screen.getAllByRole("option")).toHaveLength(12)
    expect(screen.getByRole("option", { name: "繁體中文" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("option", { name: "Русский" }))
    expect(useAppUiStore.getState().appLanguageMode).toBe("ru")
  })

  it("should show the system theme first when rendering theme options", () => {
    render(<AppearanceSection />)

    const themeSection = screen
      .getByRole("heading", {
        name: "App theme",
      })
      .closest("section")
    const themeOptions = within(themeSection!).getAllByRole("button")

    expect(themeOptions[0]).toHaveTextContent("System")
    expect(themeOptions[1]).toHaveTextContent("Light")
    expect(themeOptions[2]).toHaveTextContent("Dark")
  })
})
