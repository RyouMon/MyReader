import { QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { AppLanguageProvider } from "./components/AppLanguageProvider"
import { AppThemeProvider } from "./components/AppThemeProvider"
import { installForwardConsoleToLog } from "./forward-console-to-log"
import { queryClient } from "./hooks/queries/queryClient"
import { ensurePdfJsWorker } from "./lib/pdfWorker"
import { routeTree } from "./routeTree.gen"
import { useLibraryUiStore } from "./stores/libraryUiStore"
import "./i18n"
import "./index.css"

void ensurePdfJsWorker().catch((e) => {
  console.warn("[pdfjs] worker preload failed", e)
})
installForwardConsoleToLog()
void useLibraryUiStore.getState().hydrateActiveLibraryId()

document.addEventListener("contextmenu", (event) => {
  event.preventDefault()
})

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppLanguageProvider>
        <AppThemeProvider>
          <RouterProvider router={router} />
          <div
            id="a11y-live"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          />
        </AppThemeProvider>
      </AppLanguageProvider>
    </QueryClientProvider>
  </StrictMode>,
)
