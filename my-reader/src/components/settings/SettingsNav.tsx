import type { DesktopTranslationKey } from "@my-reader/i18n/desktop"
import {
  ArrowLeft,
  Database,
  FolderOpen,
  Info,
  type LucideIcon,
  Palette,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { SectionHeader } from "@/components/common/SectionHeader"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useWindowSizeClass } from "@/hooks/use-window-size-class"
import { cn } from "@/lib/utils"
import type { SettingsSection } from "@/types/settings"

interface SettingsNavProps {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onBack?: () => void
}

interface NavItem {
  key: SettingsSection
  tKey: DesktopTranslationKey
  Icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { key: "libraries", tKey: "settings.nav.libraries", Icon: FolderOpen },
  { key: "dataSources", tKey: "settings.nav.dataSources", Icon: Database },
  { key: "appearance", tKey: "settings.nav.appearance", Icon: Palette },
  { key: "about", tKey: "settings.nav.about", Icon: Info },
]

export default function SettingsNav({
  activeSection,
  onSectionChange,
  onBack,
}: SettingsNavProps) {
  const { t } = useTranslation()
  const isCompact = useWindowSizeClass() !== "large"
  const backLabel = t("common.back")
  const backButton = onBack ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onBack}
      aria-label={backLabel}
      className={cn(
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        !isCompact && "-ms-1",
      )}
    >
      <ArrowLeft className="size-4" />
    </Button>
  ) : null

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-e border-border bg-settings-nav transition-[width] duration-200 ease-linear",
        isCompact ? "w-12" : "w-64",
      )}
    >
      <div
        className={cn(
          "shrink-0 border-b border-border py-2",
          isCompact ? "px-2" : "px-3",
        )}
      >
        <div
          className={cn(
            "flex h-9 items-center",
            isCompact ? "justify-center" : "gap-2",
          )}
        >
          {backButton && isCompact ? (
            <Tooltip>
              <TooltipTrigger asChild>{backButton}</TooltipTrigger>
              <TooltipContent side="right" align="center">
                {backLabel}
              </TooltipContent>
            </Tooltip>
          ) : (
            backButton
          )}
          <SectionHeader
            className={cn("mb-0", isCompact && "sr-only")}
            title={t("settings.title")}
            titleClassName="text-[15px] font-semibold text-foreground"
          />
        </div>
      </div>

      <nav
        className={cn(
          "flex flex-1 flex-col gap-0.5 overflow-y-auto p-2",
          isCompact && "items-center px-1",
        )}
      >
        {NAV_ITEMS.map(({ key, tKey, Icon }) => {
          const isActive = activeSection === key
          const label = t(tKey)
          const button = (
            <button
              type="button"
              onClick={() => onSectionChange(key)}
              aria-label={label}
              className={cn(
                "flex items-center rounded-lg text-start text-[13.5px] transition-colors",
                isCompact
                  ? "size-9 justify-center p-0"
                  : "w-full gap-2.5 px-2.5 py-2",
                isActive
                  ? "bg-primary-soft font-medium text-primary"
                  : "text-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-[15px] flex-shrink-0",
                  isActive ? "opacity-100" : "opacity-70",
                )}
              />
              <span className={cn(isCompact && "sr-only")}>{label}</span>
            </button>
          )
          if (!isCompact) {
            return (
              <div key={key} className="w-full">
                {button}
              </div>
            )
          }

          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="right" align="center">
                {label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </nav>
    </aside>
  )
}
