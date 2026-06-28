import { createRequire } from "node:module"
import { copyFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const require = createRequire(import.meta.url)

const host = process.env.TAURI_DEV_HOST

/** pdf.js worker as a stable same-origin URL (Tauri + Vite hashed ?url workers often fail to import). */
function syncPdfJsWorkerToPublic(): void {
  const pkgDir = require
    .resolve("pdfjs-dist/package.json")
    .replace(/[\\/]package\.json$/, "")
  const dest = path.join(__dirname, "public", "pdf.worker.min.mjs")
  const src = path.join(pkgDir, "build", "pdf.worker.min.mjs")
  try {
    mkdirSync(path.dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  } catch (e) {
    console.warn("[vite] sync pdf.worker.min.mjs skipped:", e)
  }
}

export default defineConfig(async () => ({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@my-reader/db": path.resolve(__dirname, "../packages/db/src"),
    },
  },
  plugins: [
    {
      name: "sync-pdfjs-worker",
      buildStart() {
        syncPdfJsWorkerToPublic()
      },
    },
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}))
