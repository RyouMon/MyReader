import i18n from "@/i18n"

const FORMAT_TONES: Record<string, string> = {
  EPUB: "bg-primary text-primary-foreground",
  PDF: "bg-secondary text-secondary-foreground border border-border",
  MOBI: "bg-accent text-accent-foreground border border-border",
  AZW3: "bg-primary/85 text-primary-foreground",
  TXT: "bg-muted text-muted-foreground border border-border",
  CBZ: "bg-primary/70 text-primary-foreground",
  DJVU: "bg-foreground text-background",
  FB2: "bg-primary/75 text-primary-foreground",
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--"
  try {
    const d = new Date(dateStr)
    if (d.getFullYear() <= 100) return "--"
    return d.toLocaleDateString(i18n.resolvedLanguage ?? i18n.language, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    return dateStr
  }
}

export function getFormatTone(format: string): string {
  return FORMAT_TONES[format] ?? "bg-muted text-foreground border border-border"
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return doc.body.textContent ?? ""
}
