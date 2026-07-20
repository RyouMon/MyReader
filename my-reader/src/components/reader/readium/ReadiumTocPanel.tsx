import { List } from "lucide-react"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
  ReaderSidePanelScrollArea,
} from "@/components/reader/shared/ReaderSidePanelChrome"

export type ReadiumTocRow = {
  key?: string
  depth: number
  title: string
  href: string
  type?: string
}

interface ReadiumTocPanelProps {
  visible: boolean
  rows: ReadiumTocRow[]
  activeKey: string | null
  onSelect: (row: ReadiumTocRow) => void
  onClose?: () => void
}

function readiumTocRowKey(row: ReadiumTocRow, index: number): string {
  return row.key ?? `${index}-${row.depth}-${row.href}-${row.title}`
}

export function ReadiumTocPanel({
  visible,
  rows,
  activeKey,
  onSelect,
  onClose,
}: ReadiumTocPanelProps) {
  const { t } = useTranslation()
  const activeRowRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!visible || activeKey === null || rows.length === 0) return
    activeRowRef.current?.scrollIntoView?.({ block: "center" })
  }, [activeKey, rows.length, visible])

  return (
    <ReaderSidePanelFrame visible={visible} side="left">
      <ReaderSidePanelHeader
        title={t("reader.toc")}
        icon={List}
        onClose={onClose}
      />
      <ReaderSidePanelScrollArea className="flex min-h-full flex-col">
        <nav className="px-4 py-3">
          <ul className="space-y-0.5">
            {rows.map((row, index) => {
              const rowKey = readiumTocRowKey(row, index)
              const isActive = activeKey === rowKey
              return (
                <li key={rowKey}>
                  <button
                    ref={isActive ? activeRowRef : undefined}
                    type="button"
                    className="reader-chrome-toc-item w-full rounded-md px-2 py-1.5 text-start text-sm transition-colors"
                    aria-current={isActive ? "location" : undefined}
                    style={{ paddingInlineStart: `${8 + row.depth * 12}px` }}
                    onClick={() => onSelect(row)}
                  >
                    {row.title}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </ReaderSidePanelScrollArea>
    </ReaderSidePanelFrame>
  )
}
