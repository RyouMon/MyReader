type ReaderPanelsBackdropProps = {
  onClose: () => void
}

/** 与 `ReaderTopBar` 的 `h-[52px]` 对齐，蒙层从顶栏下方开始，避免挡住顶栏上的目录/设置切换。 */
const READER_TOP_BAR_HEIGHT_PX = 52

/**
 * 目录/设置打开时：顶栏以下半透明蒙层，点击关闭侧栏。
 */
export function ReaderPanelsBackdrop({ onClose }: ReaderPanelsBackdropProps) {
  return (
    <button
      type="button"
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-[55] border-none bg-overlay p-0 transition-opacity duration-300"
      style={{ top: READER_TOP_BAR_HEIGHT_PX }}
      onClick={onClose}
      aria-label="关闭侧栏"
    />
  )
}
