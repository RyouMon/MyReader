import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Database,
  FolderOpen,
  Info,
  type LucideIcon,
  Palette,
  RefreshCw,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { SettingsSection } from "@/types/settings"

interface SettingsNavProps {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}

interface NavItem {
  key: SettingsSection
  tKey: string
  Icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { key: "libraries", tKey: "settings.nav.libraries", Icon: FolderOpen },
  { key: "dataSources", tKey: "settings.nav.dataSources", Icon: Database },
  { key: "sync", tKey: "settings.nav.sync", Icon: RefreshCw },
  { key: "appearance", tKey: "settings.nav.appearance", Icon: Palette },
  { key: "reading", tKey: "settings.nav.reading", Icon: BookOpen },
  { key: "about", tKey: "settings.nav.about", Icon: Info },
]

/**
 * 设置侧边导航。
 */
export default function SettingsNav({
  activeSection,
  onSectionChange,
}: SettingsNavProps) {
  const { t } = useTranslation();
  return (
    <aside className="flex w-48 shrink-0 flex-col overflow-hidden border-r border-border bg-settings-nav">
      <div className="shrink-0 border-b border-border px-4 py-[18px] pb-3">
        <h2 className="font-serif text-[15px] font-semibold text-foreground">
          {t("settings.title")}
        </h2>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map(({ key, tKey, Icon }) => {
          const isActive = activeSection === key
          return (
            <button
              type="button"
              key={key}
              onClick={() => onSectionChange(key)}
              className={cn(
                "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-primary rounded-r-sm" />
              )}
              <Icon
                className={cn(
                  "size-[15px] flex-shrink-0",
                  isActive ? "opacity-100" : "opacity-70",
                )}
              />
              <span>{t(tKey)}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
