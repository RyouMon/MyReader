import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { AppThemeProvider } from "../src/components/AppThemeProvider"
import { ReadiumAnnotationPanel } from "../src/components/reader/readium/ReadiumAnnotationPanel"
import { ReadiumBookmarkPanel } from "../src/components/reader/readium/ReadiumBookmarkPanel"
import { readerChromeThemeStyle } from "../src/components/reader/shared/ReaderChromeShell"
import i18n from "../src/i18n"

type ListKind = "bookmarks" | "annotations"

function ReaderListsFixture({
  kind,
  events,
}: {
  kind: ListKind
  events: string[]
}) {
  const [items, setItems] = useState(() =>
    Array.from({ length: 20 }, (_, index) => ({
      id: `item-${index + 1}`,
      locatorKey: `locator-${index + 1}`,
      locator: {
        href: `chapter-${index + 1}.xhtml`,
        type: "application/xhtml+xml",
        locations: { position: index + 1 },
        text: {
          before: "The path continued. ",
          highlight: `Passage ${index + 1}`,
          after: " The traveller turned the page.",
        },
      },
      chapterTitle: `Chapter ${index + 1}`,
      createdAt: Date.now(),
      excerpt: `Passage ${index + 1}`,
      note: `Note ${index + 1}`,
      color: "yellow" as const,
    })),
  )
  const onSelect = ({ id }: { id: string }) => events.push(`open:${id}`)
  const onDelete = ({ id }: { id: string }) => {
    events.push(`delete:${id}`)
    setItems((current) => current.filter((item) => item.id !== id))
  }

  return kind === "bookmarks" ? (
    <ReadiumBookmarkPanel
      visible
      bookmarks={items}
      onSelect={onSelect}
      onDelete={onDelete}
    />
  ) : (
    <ReadiumAnnotationPanel
      visible
      annotations={items}
      loading={false}
      mutating={false}
      onRetry={() => {}}
      onSelect={onSelect}
      onEdit={({ id }) => events.push(`edit:${id}`)}
      onDelete={onDelete}
    />
  )
}

export async function mountReaderListsFixture(kind: ListKind) {
  await i18n.changeLanguage("en")
  const events: string[] = []
  Object.assign(window, { readerListEvents: events })
  const container = document.createElement("div")
  document.body.append(container)
  createRoot(container).render(
    <AppThemeProvider>
      <div
        className="reader-window-root relative h-screen w-full"
        data-reader-theme="sepia"
        style={readerChromeThemeStyle("sepia")}
      >
        <ReaderListsFixture kind={kind} events={events} />
      </div>
    </AppThemeProvider>,
  )
}
