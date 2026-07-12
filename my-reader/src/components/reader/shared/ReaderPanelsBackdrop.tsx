import { useTranslation } from "react-i18next"

type ReaderPanelsBackdropProps = {
  onClose: () => void
}

/**
 * 目录/设置打开时：顶栏以下半透明蒙层，点击关闭侧栏。
 */
export function ReaderPanelsBackdrop({ onClose }: ReaderPanelsBackdropProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className="pointer-events-auto absolute inset-x-0 top-[var(--reader-chrome-row-height)] bottom-0 z-[55] border-none bg-transparent p-0"
      onClick={onClose}
      aria-label={t("reader.closeSidePanel")}
    />
  )
}
