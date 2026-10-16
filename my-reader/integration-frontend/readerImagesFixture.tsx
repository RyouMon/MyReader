import React from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks"
import { Link, Links, Manifest, Metadata, Publication } from "@readium/shared"
import { ReadiumDivinaReader } from "../src/components/reader/readium/ReadiumDivinaReader"
import { AppThemeProvider } from "../src/components/AppThemeProvider"
import { useAppUiStore } from "../src/stores/appUiStore"
import { api } from "../src/lib/tauri-api"
import { queryClient } from "../src/hooks/queries/queryClient"
import i18n from "../src/i18n"

export async function mountReaderImagesFixture() {
  mockIPC(() => null)
  mockWindows("reader-test")
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: "MacIntel",
  })
  await i18n.changeLanguage("en")
  const images = ["red", "green", "blue"].map((color) => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 16
    const context = canvas.getContext("2d")!
    context.fillStyle = color
    context.fillRect(0, 0, 16, 16)
    return canvas.toDataURL("image/png")
  })
  const actions: { action: string; name: string; data: string }[] = []
  const shares: string[][] = []
  Object.assign(window, {
    readerImageActions: actions,
    readerImageShares: shares,
  })
  api.readerImageAction = async (
    action: string,
    name: string,
    data: string | null,
  ) => {
    actions.push({ action, name, data: data ?? "" })
    return `/cache/${name}`
  }
  api.shareReaderImages = async (files: string[]) => {
    shares.push(files)
  }
  useAppUiStore.setState({
    fixedLayout: {
      ...useAppUiStore.getState().fixedLayout,
      spreadMode: "double",
      direction: "ltr",
    },
  })
  const container = document.createElement("div")
  container.style.cssText = "position:fixed;inset:0"
  document.body.append(container)
  createRoot(container).render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        AppThemeProvider,
        null,
        React.createElement(ReadiumDivinaReader, {
          bookTitle: "山海",
          bookAuthors: ["张三"],
          libraryId: null,
          bookId: 1,
          format: "CBZ",
          progressSyncEnabled: false,
          initialSavedLocator: null,
          publication: new Publication({
            manifest: new Manifest({
              metadata: new Metadata({ title: "山海" }),
              readingOrder: new Links(
                images.map((href) => new Link({ href, type: "image/png" })),
              ),
            }),
          }),
        }),
      ),
    ),
  )
  return images.map((image) => image.split(",")[1])
}
