import { Check, type LucideIcon, Monitor, Moon, Sun } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/components/AppThemeProvider"
import { cn } from "@/lib/utils"
import { useAppUiStore } from "@/stores/appUiStore"
import type { AppLanguageMode, AppThemeMode } from "@/types/readerUiPreferences"

const LANGUAGE_OPTIONS: Array<{
  value: AppLanguageMode
  icon: LucideIcon | null
  glyph?: string
  tKey: string
  descriptionKey: string
}> = [
  {
    value: "system",
    icon: Monitor,
    tKey: "settings.appearance.languageSystem",
    descriptionKey: "settings.appearance.languageSystemDescription",
  },
  {
    value: "zh-CN",
    icon: null,
    glyph: "中",
    tKey: "settings.appearance.languageChinese",
    descriptionKey: "settings.appearance.languageChineseDescription",
  },
  {
    value: "en",
    icon: null,
    glyph: "A",
    tKey: "settings.appearance.languageEnglish",
    descriptionKey: "settings.appearance.languageEnglishDescription",
  },
]

const THEME_OPTIONS: Array<{
  value: AppThemeMode
  icon: LucideIcon
  tKey: string
  descriptionKey: string
}> = [
  {
    value: "system",
    icon: Monitor,
    tKey: "theme.system",
    descriptionKey: "settings.appearance.themeSystemDescription",
  },
  {
    value: "light",
    icon: Sun,
    tKey: "theme.light",
    descriptionKey: "settings.appearance.themeLightDescription",
  },
  {
    value: "dark",
    icon: Moon,
    tKey: "theme.dark",
    descriptionKey: "settings.appearance.themeDarkDescription",
  },
]

export default function AppearanceSection() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const languageMode = useAppUiStore((state) => state.appLanguageMode)
  const setLanguageMode = useAppUiStore((state) => state.setAppLanguageMode)

  return (
    <div className="flex flex-col h-full">
      <div className="px-7 py-5 pb-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold">
          {t("settings.appearance.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("settings.appearance.description")}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <section className="max-w-3xl">
          <div className="mb-3">
            <h2 className="text-sm font-medium">
              {t("settings.appearance.languageTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.appearance.languageDescription")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {LANGUAGE_OPTIONS.map(
              ({ value, icon: Icon, glyph, tKey, descriptionKey }) => {
                const selected = languageMode === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLanguageMode(value)}
                    className={cn(
                      "relative flex min-h-28 flex-col items-start rounded-md border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                      selected &&
                        "border-primary bg-accent text-accent-foreground",
                    )}
                  >
                    <span className="mb-3 flex size-8 items-center justify-center rounded-md bg-background text-foreground">
                      {Icon ? (
                        <Icon className="size-4" />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="text-lg font-medium leading-none"
                        >
                          {glyph}
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-medium">{t(tKey)}</span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {t(descriptionKey)}
                    </span>
                    {selected && (
                      <Check className="absolute right-3 top-3 size-4 text-primary" />
                    )}
                  </button>
                )
              },
            )}
          </div>
        </section>

        <section className="mt-8 max-w-3xl border-t border-border pt-6">
          <div className="mb-3">
            <h2 className="text-sm font-medium">
              {t("settings.appearance.themeTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.appearance.themeDescription")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {THEME_OPTIONS.map(
              ({ value, icon: Icon, tKey, descriptionKey }) => {
                const selected = theme === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={cn(
                      "relative flex min-h-28 flex-col items-start rounded-md border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                      selected &&
                        "border-primary bg-accent text-accent-foreground",
                    )}
                  >
                    <span className="mb-3 flex size-8 items-center justify-center rounded-md bg-background text-foreground">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-sm font-medium">{t(tKey)}</span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {t(descriptionKey)}
                    </span>
                    {selected && (
                      <Check className="absolute right-3 top-3 size-4 text-primary" />
                    )}
                  </button>
                )
              },
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
