import { createFileRoute, useParams } from "@tanstack/react-router"

import { ReadBookPage } from "@/components/reader/ReadBookPage"

export const Route = createFileRoute("/read/$bookId")({
  validateSearch: (search: Record<string, unknown>): { format?: string } => {
    const raw = search.format
    if (typeof raw !== "string") return {}
    const t = raw.trim()
    if (!t) return {}
    return { format: t.toUpperCase() }
  },
  component: ReadRoute,
})

function ReadRoute() {
  const { bookId } = useParams({ from: "/read/$bookId" })
  const { format: formatFromSearch } = Route.useSearch()
  return (
    <div className="flex h-dvh min-h-0 w-full max-w-[100vw] flex-col overflow-hidden">
      <ReadBookPage bookId={bookId} formatFromSearch={formatFromSearch} />
    </div>
  )
}
