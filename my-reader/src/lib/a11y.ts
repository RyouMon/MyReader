/**
 * Announce a message to screen readers via the ARIA live region.
 * Call this after async operations complete (cache clear, sync, etc.).
 */
export function announce(message: string): void {
  const el = document.getElementById("a11y-live")
  if (!el) return
  el.textContent = message
  // Clear after the screen reader has had time to pick it up
  setTimeout(() => {
    if (el.textContent === message) {
      el.textContent = ""
    }
  }, 1000)
}
