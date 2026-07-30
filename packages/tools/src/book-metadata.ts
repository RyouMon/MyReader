export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function extractYear(dateString: string | null): string | null {
  if (!dateString) return null
  try {
    const year = new Date(dateString).getFullYear()
    if (year <= 100) return null
    return String(year)
  } catch {
    return null
  }
}
