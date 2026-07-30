/** App-owned progress for user-facing UI. Position indexes are zero-based. */
export function displayProgressionForPosition(
  positionIndex: number,
  positionCount: number,
): number {
  "worklet"
  if (positionCount <= 0) return 0
  const count = Math.max(1, Math.round(positionCount))
  const index = Math.max(0, Math.min(count - 1, Math.round(positionIndex)))
  return (index + 1) / count
}
