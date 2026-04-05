import type { UseReaderReturn } from "@/hooks/useReader"

export interface ReaderSurfaceProps {
  bookTitle: string
  reader: UseReaderReturn
}

export type ReaderTheme = "light" | "paper" | "green" | "dark"

/** 滚动：全书连续滚动。翻页：分页/分章，点击左右或方向键翻页。 */
export type ReadingLayout = "scroll" | "paginate"

export interface ReaderSettings {
  theme: ReaderTheme
  fontFamily: string
  fontSize: number
  lineHeight: number
  paddingX: number
  readingLayout: ReadingLayout
}

export interface TocEntry {
  number: number
  title: string
  /** 嵌套层级，0 为顶层（用于侧栏缩进） */
  depth?: number
  progress?: number
  completed?: boolean
}

/** 固定版式阅读器目录侧栏条目（按页） */
export interface FixedLayoutTocEntry {
  label: string
  pageIndex: number
}

export interface TtsConfig {
  id: string
  name: string
  description: string
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "paper",
  fontFamily: "'Lora', 'Noto Serif SC', serif",
  fontSize: 18,
  lineHeight: 1.85,
  paddingX: 2.5,
  readingLayout: "paginate",
}

export const READER_FONTS = [
  {
    value: "'Lora', 'Noto Serif SC', serif",
    label: "衬线体 Serif",
  },
  {
    value: "'DM Sans', 'Noto Sans SC', sans-serif",
    label: "无衬线 Sans",
  },
  {
    value: "'JetBrains Mono', monospace",
    label: "等宽体 Mono",
  },
] as const

export const READER_THEMES: {
  id: ReaderTheme
  label: string
  swatch: string
  swatchFg?: string
  icon: string
}[] = [
  { id: "light", label: "亮色", swatch: "#ffffff", icon: "☀" },
  { id: "paper", label: "纸张", swatch: "#f5efe6", icon: "📖" },
  { id: "green", label: "护眼", swatch: "#e8f0e4", icon: "🌿" },
  {
    id: "dark",
    label: "暗色",
    swatch: "#1e1e1e",
    swatchFg: "#d4d0c8",
    icon: "🌙",
  },
]

export const DEFAULT_TTS_CONFIGS: TtsConfig[] = [
  { id: "default", name: "默认配置", description: "晓晓 · 中文普通话" },
  { id: "english", name: "英文阅读", description: "Jenny · English" },
  { id: "children", name: "儿童故事", description: "云希 · 活泼语调" },
]
