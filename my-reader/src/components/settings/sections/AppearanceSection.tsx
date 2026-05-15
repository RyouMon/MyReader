import { useTranslation } from "react-i18next"

export default function AppearanceSection() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col h-full">
      <div className="px-7 py-5 pb-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold">{t("settings.appearance.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("settings.appearance.description")}
        </p>
      </div>
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        {t("settings.appearance.comingSoon")}
      </div>
    </div>
  )
}
