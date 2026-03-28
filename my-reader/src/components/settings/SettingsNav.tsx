import {
  BookOpen,
  FolderOpen,
  Info,
  Palette,
  type LucideIcon,
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
  { key: "appearance", label: "外观", Icon: Palette },
  { key: "reading", label: "阅读偏好", Icon: BookOpen },
  { key: "about", label: "关于", Icon: Info },
]

export default function SettingsNav({
  activeSection,
  onSectionChange,
}: SettingsNavProps) {
  return (
    <aside
      className="w-48 flex-shrink-0 flex flex-col border-r border-border overflow-hidden"
      style={{ background: "var(--settings-nav-bg, #ede7dc)" }}
    >
      <div className="px-4 py-[18px] pb-3 border-b border-border shrink-0">
        <h2
          className="text-[15px] font-semibold text-foreground"
          style={{ fontFamily: "'Lora', 'Noto Serif SC', serif" }}
        >
          设置
        </h2>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {NAV_ITEMS.map(({ key, label, Icon }) => {
          const isActive = activeSection === key
          return (
            <button
              key={key}
              onClick={() => onSectionChange(key)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] transition-colors text-left relative",
                isActive
                  ? "font-medium text-primary"
                  : "text-foreground hover:bg-[#e5ddd0]",
              )}
              style={
                isActive
                  ? {
                      background:
                        "color-mix(in srgb, var(--primary) 10%, transparent)",
                    }
                  : undefined
              }
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
