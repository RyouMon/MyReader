import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { createRouter, RouterProvider } from "@tanstack/react-router"

import { ensurePdfJsWorker } from "./lib/pdfWorker"
import { routeTree } from "./routeTree.gen"
import { installForwardConsoleToLog } from "./forward-console-to-log"
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
  </StrictMode>,
)
