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
      className="absolute inset-y-0 left-0 z-60 flex w-[300px] flex-col border-r transition-all duration-300 ease-out"
      style={{
        background: "var(--reader-panel-bg)",
        borderColor: "var(--reader-chrome-border)",
        boxShadow: "8px 0 24px oklch(0.35 0.04 55 / 0.10)",
        transform: visible ? "translateX(0)" : "translateX(-100%)",
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 border-b px-5 py-4 text-[15px] font-semibold"
        style={{
          fontFamily: "'Lora', 'Noto Serif SC', serif",
          color: "var(--reader-chrome-fg)",
          borderColor: "var(--reader-chrome-border)",
        }}
      >
        <List className="size-[18px] opacity-60" />
        目录
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2"
          style={{
            borderColor: "var(--reader-chrome-border)",
            background:
              "color-mix(in srgb, var(--reader-chrome-bg) 60%, transparent)",
          }}
        >
          <Search
            className="size-3.5 shrink-0"
            style={{ color: "var(--reader-chrome-muted)" }}
          />
          <input
            type="text"
            placeholder="搜索章节…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-[13px] outline-none"
            style={{
              color: "var(--reader-chrome-fg)",
              fontFamily: "inherit",
            }}
          />
        </div>
      </div>

      {/* Chapter list */}
      <div className="flex-1 overflow-y-auto py-2">
        {filtered.map((entry) => {
          const isActive = entry.number === currentChapter
          return (
            <button
              key={entry.number}
              type="button"
              onClick={() => onSelectChapter(entry.number)}
              className={cn(
                "relative flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-[13.5px] transition-all",
                isActive && "toc-item-active font-semibold",
              )}
              style={{
                color: isActive
                  ? "var(--reader-chrome-active)"
                  : "var(--reader-chrome-fg)",
                background: isActive
                  ? "color-mix(in srgb, var(--reader-chrome-active) 8%, transparent)"
                  : "transparent",
                fontFamily: "inherit",
                border: "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background =
                    "var(--reader-chrome-hover)"
                  e.currentTarget.style.paddingLeft = "22px"
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent"
                  e.currentTarget.style.paddingLeft = "20px"
                }
              }}
            >
              <span className="min-w-0 flex-1 truncate">{entry.title}</span>
              {entry.completed && (
                <Check
                  className="size-3 shrink-0"
                  style={{ color: "var(--reader-chrome-active)", opacity: 0.6 }}
                />
              )}
              {!entry.completed && entry.progress !== undefined && (
                <span
                  className="shrink-0 text-[11px] tabular-nums"
                  style={{ color: "var(--reader-chrome-muted)" }}
                >
                  {entry.progress}%
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tabs */}
      <div
        className="flex border-t"
        style={{ borderColor: "var(--reader-chrome-border)" }}
      >
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
            className="flex-1 border-none py-3 text-center text-[12.5px] transition-all"
            style={{
              background: "transparent",
              color:
                activeTab === tab.id
                  ? "var(--reader-chrome-active)"
                  : "var(--reader-chrome-muted)",
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontFamily: "inherit",
              boxShadow:
                activeTab === tab.id
                  ? "inset 0 -2px 0 var(--reader-chrome-active)"
                  : "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--reader-chrome-hover)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </aside>
  )
}
