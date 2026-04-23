import { cn } from "@/lib/utils"

type ReaderPanelsBackdropProps = {
  open: boolean
  onClose: () => void
}

/**
 * 目录/设置打开时的全屏半透明蒙层，点击关闭侧栏。
 */
export function ReaderPanelsBackdrop({ open, onClose }: ReaderPanelsBackdropProps) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 全屏蒙层
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc 关闭侧栏
    <div
      className={cn(
        "absolute inset-0 z-55 transition-all duration-300",
        open
          ? "pointer-events-auto bg-overlay"
          : "pointer-events-none bg-transparent",
      )}
      onClick={onClose}
    />
  )
}
