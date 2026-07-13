import { act, render, screen, waitFor } from "@testing-library/react"
import { useTranslation } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AppLanguageProvider } from "@/components/AppLanguageProvider"
import i18n from "@/i18n"
import { useAppUiStore } from "@/stores/appUiStore"

function LanguageProbe() {
  const { t } = useTranslation()
  return <span>{t("settings.title")}</span>
}

describe("AppLanguageProvider", () => {
  beforeEach(async () => {
    useAppUiStore.setState({ appLanguageMode: "system" })
    await i18n.changeLanguage("zh-CN")
  })

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
    })
  })

  it("should update the interface and document language when the preference changes", async () => {
    render(
      <AppLanguageProvider>
        <LanguageProbe />
      </AppLanguageProvider>,
    )

    act(() => {
      useAppUiStore.setState({ appLanguageMode: "en" })
    })

    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument()
      expect(document.documentElement.lang).toBe("en")
    })
  })
})
