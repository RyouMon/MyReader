/**
 * Prefer `requested` when it matches a file on the book and is readable;
 * otherwise use the preferred format resolved by MyReader Core.
 */
export function resolveReadFormat(
  readableFormats: string[],
  preferredFormat: string | null | undefined,
  requested: string | null | undefined,
): string | null {
  if (requested) {
    const normalized = requested.toUpperCase()
    if (readableFormats.includes(normalized)) return normalized
  }
  const preferred = preferredFormat?.toUpperCase()
  return preferred && readableFormats.includes(preferred) ? preferred : null
}
