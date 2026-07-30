import { resolveReadFormat } from "@my-reader/tools/utils"

export function getFormatFromPath(path: string): string | undefined {
  const match = path.match(/\.([A-Za-z0-9]+)$/)
  return match?.[1]?.toUpperCase()
}

export function resolveEffectiveFormat(
  readableFormats: string[],
  selectedFormat?: string,
  preferredFormat?: string | null,
): string | undefined {
  return (
    resolveReadFormat(
      readableFormats,
      preferredFormat ?? readableFormats[0],
      selectedFormat,
    ) ?? undefined
  )
}

export function pathBelongsToBook(
  relativePath: string,
  bookPath?: string,
): boolean {
  if (!bookPath) return false
  const normalizedBookPath = bookPath.replace(/^\/+/, "").replace(/\/+$/, "")
  return (
    relativePath === normalizedBookPath ||
    relativePath.startsWith(`${normalizedBookPath}/`)
  )
}
