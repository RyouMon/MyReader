/**
 * Generate a muted, earth-tone fallback gradient for books without a cover.
 *
 * Matches the design in .superdesign/design_iterations/library_grid_1.html:
 * a three-stop linear gradient (160deg) with low saturation, plus a subtle
 * bottom scrim for depth.
 */
export function generateCoverGradient(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360

  return (
    `linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.15)), ` +
    `linear-gradient(160deg, hsl(${hue}, 22%, 38%) 0%, hsl(${(hue + 15) % 360}, 18%, 28%) 50%, hsl(${(hue + 30) % 360}, 15%, 20%) 100%)`
  )
}
