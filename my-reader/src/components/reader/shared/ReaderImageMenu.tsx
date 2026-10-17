import { Copy, Download, Ellipsis, Share } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ReaderImageSource } from "@/types/reader"

export function ReaderImageMenu({
  target,
  onClose,
  onAction,
}: {
  target: { source: ReaderImageSource; x: number; y: number } | null
  onClose: () => void
  onAction: (action: "copy" | "save", source: ReaderImageSource) => void
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: target?.x ?? 0,
            top: target?.y ?? 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => {
              if (target) onAction("copy", target.source)
            }}
          >
            <Copy />
            {t("reader.copyImage")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              if (target) onAction("save", target.source)
            }}
          >
            <Download />
            {t("reader.saveImage")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ReaderShareMenu({
  onShare,
  busy,
  visible,
}: {
  onShare: () => void
  busy: boolean
  visible: boolean
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t("reader.imageMore")}
          aria-label={t("reader.imageMore")}
          className="reader-chrome-icon-btn"
          data-chrome-visible={visible ? "true" : "false"}
          data-shape="circle"
          disabled={busy}
        >
          <Ellipsis className="size-[17px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onShare} disabled={busy}>
            <Share />
            {t("reader.sharePage")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
