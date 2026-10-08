import type { ReactNode, Ref } from "react"
import { generateCoverGradient } from "@/lib/cover-gradient"
import { cn } from "@/lib/utils"

export const DETAIL_CARD_CLASS =
  "relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-card shadow-none transition-colors duration-[340ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none"

export function BookDetailFrame({
  className,
  title,
  isNarrowHero,
  forceWideHero,
  showNarrowCoverBackdrop,
  coverSrc,
  handleCoverError,
  bodyHostRef,
  bodyRef,
  handleDetailScroll,
  setDetailHeroElement,
  header,
  hero,
  content,
  dialog,
}: {
  className?: string
  title: string
  isNarrowHero: boolean
  forceWideHero: boolean
  showNarrowCoverBackdrop: boolean
  coverSrc: string | null
  handleCoverError: () => void
  bodyHostRef: Ref<HTMLDivElement>
  bodyRef: Ref<HTMLDivElement>
  handleDetailScroll: () => void
  setDetailHeroElement: Ref<HTMLDivElement>
  header: ReactNode
  hero: ReactNode
  content: ReactNode
  dialog: ReactNode
}) {
  const showMutedCoverBackdrop = !isNarrowHero || showNarrowCoverBackdrop
  const isNarrowCoverBackdropActive = isNarrowHero && showNarrowCoverBackdrop
  return (
    <section
      className={cn(
        DETAIL_CARD_CLASS,
        isNarrowHero && "detail-pane-narrow-hero",
        isNarrowCoverBackdropActive && "detail-pane-cover-backdrop-active",
        className,
      )}
      data-testid="book-detail-pane"
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-[340ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none",
          showMutedCoverBackdrop ? "opacity-100" : "opacity-0",
        )}
      >
        {coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            className={cn(
              "size-full object-cover mix-blend-soft-light saturate-75 transition-opacity duration-[340ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none",
              isNarrowCoverBackdropActive
                ? "opacity-[0.18]"
                : "opacity-[0.055]",
            )}
            aria-hidden="true"
            onError={handleCoverError}
          />
        ) : (
          <div
            className={cn(
              "size-full saturate-75 transition-opacity duration-[340ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none",
              isNarrowCoverBackdropActive
                ? "opacity-[0.14]"
                : "opacity-[0.045]",
            )}
            style={{ background: generateCoverGradient(title) }}
            aria-hidden="true"
          />
        )}
      </div>
      {header}
      <div
        ref={bodyHostRef}
        className="relative z-10 min-h-0 min-w-0 flex-1"
        data-overlayscrollbars-initialize
      >
        <div
          ref={bodyRef}
          onScroll={handleDetailScroll}
          className="detail-body myreader-overlay-viewport h-full min-w-0 overflow-x-hidden overflow-y-auto"
        >
          <div className={cn(!isNarrowHero && "pt-14")}>
            <div className="relative mx-auto w-full min-w-0 max-w-[1320px]">
              <div
                ref={setDetailHeroElement}
                className="detail-hero-responsive mb-8"
                data-narrow-hero={isNarrowHero ? "true" : undefined}
                data-wide-hero={forceWideHero ? "true" : undefined}
              >
                {hero}
              </div>

              <div
                className={cn(
                  "detail-content-stack min-w-0 px-4 pb-10 sm:px-6 lg:px-8 xl:px-6 2xl:px-8",
                  !isNarrowHero && "sm:px-5 lg:px-5 xl:px-5 2xl:px-7",
                )}
              >
                {content}
              </div>
            </div>
          </div>
        </div>
      </div>

      {dialog}
    </section>
  )
}
