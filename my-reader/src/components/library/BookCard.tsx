import { memo, useCallback, useState } from "react"
import { BookOpen, Ellipsis } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { buildCoverUrl } from "@/lib/cover"
import type { CalibreBook } from "@/types/book"

interface BookCardProps {
  book: CalibreBook
  libraryId: string | null
  onRead?: (book: CalibreBook) => void
  onMore?: (book: CalibreBook) => void
}

/** Module-level set so broken covers aren't retried on re-mount (virtual scrolling). */
const brokenCovers = new Set<string>()

function generateCoverGradient(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return `linear-gradient(160deg, hsl(${hue}, 30%, 30%) 0%, hsl(${hue + 30}, 25%, 20%) 50%, hsl(${hue + 15}, 20%, 15%) 100%)`
}

const BookCard = memo(function BookCard({
  book,
  libraryId,
  onRead,
  onMore,
}: BookCardProps) {
  const [hovered, setHovered] = useState(false)
  const [imgFailed, setImgFailed] = useState(() => brokenCovers.has(book.path))

  const showRealCover = book.hasCover && libraryId && !imgFailed
  const coverSrc = showRealCover ? buildCoverUrl(libraryId, book.path) : null
  const displayAuthor = book.authors.join(", ")
  const primaryFormat = book.formats[0] ?? ""

  const handleImgError = useCallback(() => {
    brokenCovers.add(book.path)
    setImgFailed(true)
  }, [book.path])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 鼠标悬浮时会有交互
    <div
      className={cn("cursor-pointer group/card min-w-0")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Cover — 2:3 比例随列宽伸缩，图片 cover 铺满 */}
      <div
        className="relative w-full overflow-hidden rounded-lg"
        style={{
          aspectRatio: "2/3",
          boxShadow: hovered
            ? "0 12px 28px rgba(59,47,47,0.15), 0 4px 10px rgba(59,47,47,0.08)"
            : "0 2px 8px rgba(59,47,47,0.10), 0 1px 3px rgba(59,47,47,0.06)",
          transform: hovered ? "translateY(-6px)" : "translateY(0)",
          transition:
            "transform 0.3s cubic-bezier(0.4,0,0.2,1), box-shadow 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={book.title}
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
            decoding="async"
            onError={handleImgError}
          />
        ) : (
          <div
            className="absolute inset-0 size-full flex flex-col items-center justify-center px-3 py-4 text-center overflow-hidden"
            style={{ background: generateCoverGradient(book.title) }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.15))",
              }}
            />
            <span
              className="font-semibold text-base text-white leading-[1.4] relative z-10"
              style={{
                fontFamily: "'Lora', 'Noto Serif SC', serif",
                textShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }}
            >
              {book.title}
            </span>
            <span
              className="text-[11px] mt-1.5 relative z-10"
              style={{
                color: "rgba(255,255,255,0.8)",
                textShadow: "0 1px 2px rgba(0,0,0,0.2)",
              }}
            >
              {displayAuthor.length > 12
                ? `${displayAuthor.slice(0, 11)}…`
                : displayAuthor}
            </span>
          </div>
        )}

        {/* Format badge */}
        {primaryFormat && (
          <Badge
            variant="secondary"
            className="absolute bottom-2 left-2 z-10 rounded-sm text-[10px] py-0 px-1.5 uppercase tracking-wide"
            style={{
              background: "rgba(0,0,0,0.4)",
              color: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(4px)",
              border: "none",
            }}
          >
            {primaryFormat}
          </Badge>
        )}

        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center gap-3 z-20 transition-opacity duration-200"
          style={{
            background: "rgba(0,0,0,0.45)",
            opacity: hovered ? 1 : 0,
          }}
        >
          <Button
            variant="secondary"
            size="icon-sm"
            title="阅读"
            className="rounded-full bg-white/90 hover:bg-white text-foreground size-9 transition-transform"
            style={{ transform: hovered ? "scale(1)" : "scale(0.8)" }}
            onClick={(e) => {
              e.stopPropagation()
              onRead?.(book)
            }}
          >
            <BookOpen className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            title="更多"
            className="rounded-full bg-white/90 hover:bg-white text-foreground size-9 transition-transform"
            style={{ transform: hovered ? "scale(1)" : "scale(0.8)" }}
            onClick={(e) => {
              e.stopPropagation()
              onMore?.(book)
            }}
          >
            <Ellipsis className="size-4" />
          </Button>
        </div>
      </div>

      {/* Book info */}
      <div className="px-0.5 pt-2.5">
        <p
          className="text-sm font-semibold leading-[1.35] line-clamp-2 transition-colors duration-200"
          style={{
            fontFamily: "'Lora', 'Noto Serif SC', serif",
            color: hovered ? "var(--primary)" : "var(--foreground)",
          }}
        >
          {book.title}
        </p>
        <p className="text-xs mt-0.5 truncate text-muted-foreground">
          {displayAuthor}
        </p>
      </div>
    </div>
  )
})

export default BookCard
