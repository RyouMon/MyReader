let workerConfigured: Promise<void> | null = null

function pdfWorkerHref(): string {
  let base = import.meta.env.BASE_URL || "/"
  if (!base.endsWith("/")) base += "/"
  return new URL("pdf.worker.min.mjs", window.location.origin + base).href
}

/**
 * pdf.js 在调用 `getDocument` 之前必须设置 `GlobalWorkerOptions.workerSrc`。
 * Worker 文件由 Vite `sync-pdfjs-worker` 插件复制到 `public/pdf.worker.min.mjs`，
 * 使用固定同源路径，避免 Tauri WebView 对 Vite `?url` worker 分包的模块导入失败。
 */
export function ensurePdfJsWorker(): Promise<void> {
  if (!workerConfigured) {
    workerConfigured = (async () => {
      const pdfjs = await import("pdfjs-dist")
      if (pdfjs.GlobalWorkerOptions.workerSrc) return
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerHref()
    })()
  }
  return workerConfigured
}
