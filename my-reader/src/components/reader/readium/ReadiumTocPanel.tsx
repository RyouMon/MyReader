import { List } from "lucide-react"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import { cn } from "@/lib/utils"

export type ReadiumTocRow = {
  depth: number
  title: string
  href: string
  type?: string
}

interface ReadiumTocPanelProps {
  visible: boolean
  rows: ReadiumTocRow[]
  activeHref: string | null
  onSelect: (row: ReadiumTocRow) => void
  onClose?: () => void
}

export function ReadiumTocPanel({
  visible,
  rows,
  activeHref,
  onSelect,
  onClose,
}: ReadiumTocPanelProps) {
  return (
    <ReaderSidePanelFrame visible={visible} side="left">
      <ReaderSidePanelHeader title="目录" icon={List} onClose={onClose} />
      <nav className="reader-chrome-scroll max-h-[calc(100vh-8rem)] overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          {rows.map((row, index) => (
            <li key={`${index}-${row.depth}-${row.href}-${row.title}`}>
              <button
                type="button"
                className={cn(
                  "reader-chrome-toc-item w-full rounded-md px-2 py-1.5 text-left text-sm text-reader-chrome-fg transition-colors",
                  activeHref === row.href.split("#")[0] && "bg-reader-chrome-muted/35",
                )}
                style={{ paddingLeft: `${8 + row.depth * 12}px` }}
                onClick={() => onSelect(row)}
              >
                {row.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </ReaderSidePanelFrame>
  )
}
