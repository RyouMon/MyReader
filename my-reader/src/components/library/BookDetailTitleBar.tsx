import { ChevronLeft, Maximize2, Minimize2, PanelRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

export default function BookDetailTitleBar({
  onBackToList,
  fullScreenAvailable,
  detailFullScreen,
  onToggleDetailFullScreen,
  detailVisible,
  onToggleDetail,
}: {
  onBackToList: () => void
  fullScreenAvailable: boolean
  detailFullScreen: boolean
  onToggleDetailFullScreen: () => void
  detailVisible: boolean
  onToggleDetail: () => void
}) {
  const { t } = useTranslation()
  const showBack = detailVisible && (!fullScreenAvailable || detailFullScreen)
  const toggleLabel = t(detailVisible ? "common.close" : "reader.backToDetail")
  const FullScreenIcon = detailFullScreen ? Minimize2 : Maximize2
  const fullScreenLabel = t(
    detailFullScreen ? "reader.exitFullscreen" : "reader.fullscreen",
  )

  return (
    <div
      data-tauri-drag-region
      className="flex h-full min-w-0 flex-1 items-center justify-between px-2 text-muted-foreground"
    >
      {showBack ? (
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("common.back")}
          aria-label={t("common.back")}
          data-testid="book-detail-back"
          onClick={onBackToList}
        >
          <ChevronLeft />
        </Button>
      ) : null}
      <div className="ms-auto flex items-center">
        {detailVisible && fullScreenAvailable ? (
          <Button
            variant="ghost"
            size="icon-sm"
            title={fullScreenLabel}
            aria-label={fullScreenLabel}
            data-testid="book-detail-fullscreen-toggle"
            onClick={onToggleDetailFullScreen}
          >
            <FullScreenIcon />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={detailVisible}
          data-testid={detailVisible ? "book-detail-close" : "book-detail-open"}
          onClick={onToggleDetail}
        >
          <PanelRight strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  )
}
