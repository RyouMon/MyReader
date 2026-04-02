import { isTauri } from "@tauri-apps/api/core"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"

function readerWindowLabel(bookId: string): string {
  return `reader-${bookId}`
}

/**
 * 在 Tauri 中打开独立阅读窗口；若已存在同书籍窗口则聚焦。
 * 非 Tauri 环境不执行任何操作，由调用方回退到应用内路由。
 *
 * @param bookTitle 窗口标题（通常为书名）；未传时由阅读页加载详情后再设置。
 */
export async function openReaderInNewWindow(
  bookId: string,
  format?: string,
  bookTitle?: string,
): Promise<void> {
  if (!isTauri()) return

  const windowTitle = bookTitle?.trim() || "阅读"

  const label = readerWindowLabel(bookId)
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.setTitle(windowTitle)
    await existing.show()
    await existing.setFocus()
    return
  }

  const search = format ? `?format=${encodeURIComponent(format)}` : ""
  const url = `/read/${encodeURIComponent(bookId)}${search}`

  const win = new WebviewWindow(label, {
    url,
    title: windowTitle,
    width: 1100,
    height: 800,
    minWidth: 400,
    minHeight: 320,
    center: true,
    resizable: true,
    focus: true,
  })

  win.once("tauri://error", (e) => {
    console.error("阅读窗口创建失败", e)
  })
}

/**
 * 当前 Webview 是否为应用主窗口（用于将误在主窗口打开的 `/read` 转到独立窗口）。
 */
export function isMainWebviewWindow(): boolean {
  if (!isTauri()) return false
  return WebviewWindow.getCurrent().label === "main"
}
