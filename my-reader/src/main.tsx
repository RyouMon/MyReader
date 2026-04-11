import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { configurePdfJsWorker } from "my-reader-tools/rendition"

import { routeTree } from "./routeTree.gen"
import { installForwardConsoleToLog } from "./forward-console-to-log"
import "./index.css"

async function configureDesktopPdfWorker() {
  try {
    const workerModule = await import("../../my-reader-tools/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url")
    configurePdfJsWorker({ workerSrc: workerModule.default })
  } catch (error) {
    console.warn("[pdf-parser] desktop worker init failed, falling back to runtime default", error)
  }
}

void configureDesktopPdfWorker()
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
