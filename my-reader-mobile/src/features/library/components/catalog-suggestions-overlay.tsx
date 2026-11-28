import {
  type CatalogToken,
  tokenKey,
} from "@my-reader/tools/catalog-navigation"
import { type ReactNode, type RefObject, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import type { View } from "react-native"
import {
  AnchoredSuggestions,
  type SuggestionOverlayItem,
  SuggestionsOverlayHost,
} from "@/src/components/ui/suggestions-overlay"

type Suggestions = {
  anchor: RefObject<View | null>
  items: CatalogToken[]
  onChoose: (token: CatalogToken) => void
  onDismiss: () => void
  rowHeight?: number
}

export function CatalogSuggestionsHost({ children }: { children: ReactNode }) {
  return (
    <SuggestionsOverlayHost testID="catalog-suggestions-host">
      {children}
    </SuggestionsOverlayHost>
  )
}

// Keep the popup outside the virtualized list header so its bounds accept taps.
export function CatalogSuggestions({
  anchor,
  items,
  onChoose,
  onDismiss,
  rowHeight,
}: Suggestions) {
  const { t } = useTranslation()
  const overlayItems = useMemo<SuggestionOverlayItem[]>(
    () =>
      items.map((token) => ({
        key: tokenKey(token),
        title: token.value,
        value: t(`catalog.${token.kind}`),
        label: `${t(`catalog.${token.kind}`)}, ${token.value}`,
      })),
    [items, t],
  )
  const handleChoose = useCallback(
    (selected: SuggestionOverlayItem) => {
      const match = items.find((token) => tokenKey(token) === selected.key)
      if (match) onChoose(match)
    },
    [items, onChoose],
  )
  return (
    <AnchoredSuggestions
      anchor={anchor}
      items={overlayItems}
      accessibilityLabel={t("catalog.suggestions")}
      onChoose={handleChoose}
      onDismiss={onDismiss}
      rowHeight={rowHeight}
      listTestID="catalog-suggestions"
      dismissTestID="catalog-suggestions-dismiss"
      compactRow
    />
  )
}
