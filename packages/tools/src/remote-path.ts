/** Appends one user-entered directory name to a remote browser path. */
export function appendRemotePathSegment(
  parentPath: string,
  segmentInput: string,
): string | null {
  const segment = segmentInput.trim()
  if (
    !segment ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.includes("\0")
  ) {
    return null
  }

  const parent = parentPath.trim().replace(/\/+$/, "")
  return `${parent}/${segment}`
}
