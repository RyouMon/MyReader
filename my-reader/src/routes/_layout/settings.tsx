import { createFileRoute } from "@tanstack/react-router"
import type { SettingsSection } from "@/types/settings"

const SETTINGS_SECTIONS = new Set<SettingsSection>([
  "libraries",
  "dataSources",
  "speech",
  "appearance",
  "about",
])

export const Route = createFileRoute("/_layout/settings")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    section?: SettingsSection
    returnBookId?: string
    returnFormat?: string
  } => {
    const section =
      typeof search.section === "string" &&
      SETTINGS_SECTIONS.has(search.section as SettingsSection)
        ? (search.section as SettingsSection)
        : undefined
    const returnBookId =
      typeof search.returnBookId === "string" && search.returnBookId.trim()
        ? search.returnBookId.trim()
        : undefined
    const returnFormat =
      typeof search.returnFormat === "string" && search.returnFormat.trim()
        ? search.returnFormat.trim().toUpperCase()
        : undefined
    return { section, returnBookId, returnFormat }
  },
})
