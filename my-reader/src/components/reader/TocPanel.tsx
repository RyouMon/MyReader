import { Check, List, Search } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"

import type { TocEntry } from "./types"

interface TocPanelProps {
  visible: boolean
  entries: TocEntry[]
  currentChapter: number
  onSelectChapter: (chapter: number) => void
}

export function TocPanel({
  visible,
  entries,
  currentChapter,
  onSelectChapter,
}: TocPanelProps) {
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"toc" | "bookmarks" | "notes">(
    "toc",
  )

  const filtered = search
    ? entries.filter((e) =>
        e.title.toLowerCase().includes(search.toLowerCase()),
      )
    : entries

  return (
    <aside
      className={cn(
        "reader-chrome-panel-aside reader-chrome-panel-shadow-l absolute inset-y-0 left-0 z-60 flex w-[300px] flex-col border-r border-reader-chrome-border transition-all duration-300 ease-out",
        visible
          ? "translate-x-0 opacity-100"
          : "pointer-events-none -translate-x-full opacity-0",
      )}
    >
      <div className="font-serif flex items-center gap-2.5 border-b border-reader-chrome-border px-5 py-4 text-[15px] font-semibold text-reader-chrome-fg">
        <List className="size-[18px] opacity-60" />
        目录
      </div>

      <div className="px-4 pt-3 pb-2">
        <div className="reader-chrome-search-field flex items-center gap-2 rounded-lg border px-3 py-2">
          <Search className="size-3.5 shrink-0 text-reader-chrome-muted" />
          <input
            type="text"
            placeholder="搜索章节…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent font-inherit text-[13px] text-reader-chrome-fg outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {filtered.map((entry, rowIndex) => {
          const isActive = entry.number === currentChapter
          const depth = entry.depth ?? 0
          return (
            <button
              key={`${rowIndex}-${depth}-${entry.number}-${entry.title}`}
              type="button"
              onClick={() => onSelectChapter(entry.number)}
              className={cn("reader-toc-row", isActive && "toc-item-active")}
            >
              <span
                className="min-w-0 flex-1 truncate"
                style={
                  depth > 0
                    ? { marginInlineStart: `${depth * 0.75}rem` }
                    : undefined
                }
              >
                {entry.title}
              </span>
              {entry.completed && (
                <Check className="size-3 shrink-0 text-reader-chrome-active opacity-60" />
              )}
              {!entry.completed && entry.progress !== undefined && (
                <span className="shrink-0 text-[11px] tabular-nums text-reader-chrome-muted">
                  {entry.progress}%
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex border-t border-reader-chrome-border">
        {(
          [
            { id: "toc", label: "目录" },
            { id: "bookmarks", label: "书签 (3)" },
            { id: "notes", label: "笔记 (7)" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="reader-chrome-tab"
            data-active={activeTab === tab.id ? "true" : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </aside>
  )
}
