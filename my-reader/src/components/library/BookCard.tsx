import { BookOpen, Ellipsis } from "lucide-react"
import { memo, useCallback, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buildCoverUrl } from "@/lib/cover"
import { cn } from "@/lib/utils"
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
    // biome-ignore lint/a11y/useKeyWithClickEvents: 点击时会有交互
    <div
      className={cn("cursor-pointer group/card min-w-0")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onRead?.(book)}
    >
      {/* Cover — 2:3 比例随列宽伸缩；transform/box-shadow 用内联过渡，避免与 Button 的 transition-all 冲突且阴影插值更顺 */}
      <div
        className="relative aspect-[2/3] w-full overflow-hidden rounded-lg"
        style={{
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
            <span className="relative z-10 text-base font-semibold leading-[1.4] text-white font-serif [text-shadow:0_1px_4px_rgba(0,0,0,0.3)]">
              {book.title}
            </span>
            <span className="relative z-10 mt-1.5 text-[11px] text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.2)]">
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
            className="absolute bottom-2 left-2 z-10 rounded-sm border-0 bg-black/40 px-1.5 py-0 text-[10px] uppercase tracking-wide text-white/85 backdrop-blur-sm"
          >
            {primaryFormat}
          </Badge>
        )}

        {/* Hover overlay */}
        <div
          className={cn(
            "absolute inset-0 z-20 flex items-center justify-center gap-3 bg-black/45 transition-opacity duration-200 ease-out",
            hovered ? "opacity-100" : "opacity-0",
          )}
        >
          <Button
            variant="secondary"
            size="icon-sm"
            title="阅读"
            className="size-9 rounded-full bg-white/90 text-foreground hover:bg-white"
            style={{
              transform: hovered ? "scale(1)" : "scale(0.8)",
              transition:
                "transform 0.3s cubic-bezier(0.4,0,0.2,1), background-color 0.15s ease",
            }}
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
            className="size-9 rounded-full bg-white/90 text-foreground hover:bg-white"
            style={{
              transform: hovered ? "scale(1)" : "scale(0.8)",
              transition:
                "transform 0.3s cubic-bezier(0.4,0,0.2,1), background-color 0.15s ease",
            }}
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
          className={cn(
            "line-clamp-2 font-serif text-sm font-semibold leading-[1.35] text-foreground transition-colors duration-200",
            hovered && "text-primary",
          )}
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
