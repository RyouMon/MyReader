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
  label: string
  Icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { key: "libraries", label: "书库管理", Icon: FolderOpen },
  { key: "dataSources", label: "数据源管理", Icon: Database },
  { key: "sync", label: "同步与下载", Icon: RefreshCw },
  { key: "appearance", label: "外观", Icon: Palette },
  { key: "reading", label: "阅读偏好", Icon: BookOpen },
  { key: "about", label: "关于", Icon: Info },
]

/**
 * 设置侧边导航。
 */
export default function SettingsNav({
  activeSection,
  onSectionChange,
}: SettingsNavProps) {
  return (
    <aside className="flex w-48 shrink-0 flex-col overflow-hidden border-r border-border bg-settings-nav">
      <div className="shrink-0 border-b border-border px-4 py-[18px] pb-3">
        <h2 className="font-serif text-[15px] font-semibold text-foreground">
          设置
        </h2>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map(({ key, label, Icon }) => {
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
              <span>{label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
