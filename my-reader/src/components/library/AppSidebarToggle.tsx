import { PanelLeft } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

interface AppSidebarToggleProps {
  className?: string
  testId?: string
}

export default function AppSidebarToggle({
  className,
  testId = "sidebar-toggle-button",
}: AppSidebarToggleProps) {
  const { t } = useTranslation()
  const { state, isMobile, openMobile, forceCollapsed, toggleSidebar } =
    useSidebar()

  const isOpen = forceCollapsed || isMobile ? openMobile : state !== "collapsed"
  const label = isOpen ? t("sidebar.collapse") : t("sidebar.expand")

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      data-testid={testId}
      onClick={toggleSidebar}
      title={label}
      aria-label={label}
      aria-expanded={isOpen}
      className={cn("text-muted-foreground", className)}
    >
      <PanelLeft strokeWidth={1.5} />
    </Button>
  )
}
