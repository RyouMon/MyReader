const COVER_GRADIENT_CLASSES = [
  "bg-[linear-gradient(160deg,var(--primary)_0%,var(--secondary)_50%,var(--ink-1)_100%)]",
  "bg-[linear-gradient(160deg,var(--secondary)_0%,var(--primary)_48%,var(--ink-1)_100%)]",
  "bg-[linear-gradient(160deg,var(--ink-2)_0%,var(--secondary)_54%,var(--ink-1)_100%)]",
  "bg-[linear-gradient(160deg,var(--secondary)_0%,var(--ink-2)_52%,var(--ink-1)_100%)]",
  "bg-[linear-gradient(160deg,var(--primary)_0%,var(--ink-2)_54%,var(--ink-1)_100%)]",
  "bg-[linear-gradient(160deg,var(--ink-2)_0%,var(--primary)_52%,var(--ink-1)_100%)]",
]

/**
 * Returns a deterministic Tailwind fallback cover gradient for books without a
 * real cover. The palette uses semantic MyReader tokens instead of inline CSS.
 */
export function getCoverGradientClass(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0
  }

  return COVER_GRADIENT_CLASSES[Math.abs(hash) % COVER_GRADIENT_CLASSES.length]
}
