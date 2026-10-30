import { useLayoutEffect, useRef } from "react"
import { Loader2 } from "lucide-react"

/** A quiet, single-line stream that follows the newest output. */
export function StreamingStatusLine({
  text,
  label,
}: {
  text: string
  label: string
}) {
  const viewport = useRef<HTMLSpanElement>(null)
  const content = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const container = viewport.current!
    const line = content.current!
    let previousOverflow = 0
    const follow = () => {
      const overflow = Math.max(0, line.scrollWidth - container.clientWidth)
      // A new batch or shorter phase should not slide in from far offscreen.
      line.style.transitionProperty = overflow < previousOverflow ? "none" : ""
      line.style.transform = `translateX(${-overflow}px)`
      previousOverflow = overflow
    }
    const observer = new ResizeObserver(follow)
    observer.observe(container)
    observer.observe(line)
    follow()
    return () => observer.disconnect()
  }, [])
  return (
    <div
      role="status"
      aria-label={label}
      className="flex w-full min-w-0 items-center gap-2 text-sm text-muted-foreground"
    >
      <span className="sr-only">{label}</span>
      <Loader2
        aria-hidden
        className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
      />
      <span
        ref={viewport}
        aria-hidden
        className="min-w-0 flex-1 overflow-hidden"
      >
        <span
          ref={content}
          className="inline-block whitespace-nowrap align-bottom transition-transform duration-200 ease-out motion-reduce:transition-none"
        >
          {(text || label).replace(/\s+/g, " ")}
        </span>
      </span>
    </div>
  )
}
