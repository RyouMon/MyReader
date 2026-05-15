import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { installForwardConsoleToLog } from "./forward-console-to-log"
import { ensurePdfJsWorker } from "./lib/pdfWorker"
import { routeTree } from "./routeTree.gen"
import "./i18n"
import "./index.css"

void ensurePdfJsWorker().catch((e) => {
  console.warn("[pdfjs] worker preload failed", e)
})
installForwardConsoleToLog()

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
    <div
      id="a11y-live"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  </StrictMode>,
)
