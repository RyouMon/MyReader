import NewsstandIcon from "@expo/material-symbols/newsstand.xml"

import type { EmptyStateIcon } from "./empty-state"

export const LIBRARY_EMPTY_STATE_ICON = {
  ios: "books.vertical.fill",
  android: NewsstandIcon,
} as const satisfies EmptyStateIcon
