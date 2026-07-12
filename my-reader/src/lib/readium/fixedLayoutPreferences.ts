import type {
  FixedBackground,
  FixedNavigationMode,
} from "@/components/reader/types"
import type { ResolvedAppTheme } from "@/types/readerUiPreferences"

export function normalizeFixedBackground(value: unknown): FixedBackground {
  return value === "black" || value === "white" ? value : "auto"
}

export function normalizeFixedNavigationMode(
  value: unknown,
): FixedNavigationMode {
  return value === "vertical" ? "vertical" : "horizontal"
}

export function resolveFixedBackgroundColor(
  background: FixedBackground,
  resolvedTheme: ResolvedAppTheme,
): "#000000" | "#FFFFFF" {
  if (background === "black") return "#000000"
  if (background === "white") return "#FFFFFF"
  return resolvedTheme === "dark" ? "#000000" : "#FFFFFF"
}
