import { useCallback, useMemo, useRef, useState } from "react"
import { Keyboard, View } from "react-native"
import { useTranslation } from "react-i18next"
import {
  catalogSuggestions,
  parseCatalogTokens,
  type CatalogNavigation,
  type CatalogToken,
} from "@my-reader/tools/catalog-navigation"
import { useThemePalette } from "@/src/design/tokens"
import { useDebouncedValue } from "@/src/hooks/use-debounced-value"
import CatalogTokenInput from "./catalog-token-input"
import type { CatalogTokenInputHandle } from "./catalog-token-input.types"
import { CatalogSuggestions } from "./catalog-suggestions-overlay"

const NO_SUGGESTIONS: CatalogToken[] = []

export function CatalogTokenField({
  tokens,
  onTokensChange,
  navigation,
  query,
  onQueryChange,
  placeholder,
}: {
  tokens: CatalogToken[]
  onTokensChange: (tokens: CatalogToken[]) => void
  navigation: CatalogNavigation
  query: string
  onQueryChange: (query: string) => void
  placeholder?: string
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const input = useRef<CatalogTokenInputHandle>(null)
  const anchor = useRef<View>(null)
  const [inputHeight, setInputHeight] = useState<number>()
  const [dismissed, setDismissed] = useState(false)
  const dismiss = useCallback(() => setDismissed(true), [])
  const hasQuery = query.trim().length > 0
  const delayed = useDebouncedValue(query, 180)
  const suggestions = useMemo(
    () =>
      hasQuery
        ? catalogSuggestions(navigation, delayed, tokens).slice(0, 40)
        : NO_SUGGESTIONS,
    [navigation, hasQuery, delayed, tokens],
  )
  const choose = useCallback(
    (token: CatalogToken) => {
      onTokensChange(parseCatalogTokens([...tokens, token]))
      onQueryChange("")
      setDismissed(true)
      input.current?.focus()
    },
    [onQueryChange, onTokensChange, tokens],
  )
  function submit() {
    setDismissed(true)
    Keyboard.dismiss()
  }
  return (
    <View
      ref={anchor}
      testID="catalog-token-field"
      onTouchStart={() => setDismissed(false)}
      style={{
        paddingVertical: 8,
        gap: 8,
        backgroundColor: palette.background,
      }}
    >
      <CatalogTokenInput
        ref={input}
        tokens={tokens}
        text={query}
        placeholder={placeholder ?? t("catalog.searchPlaceholder")}
        onChange={(nextTokens, value) => {
          setDismissed(false)
          if (JSON.stringify(nextTokens) !== JSON.stringify(tokens)) {
            onTokensChange(nextTokens)
          }
          onQueryChange(value)
        }}
        onSubmit={submit}
        onHeightChange={setInputHeight}
      />
      <CatalogSuggestions
        anchor={anchor}
        rowHeight={inputHeight}
        items={dismissed ? NO_SUGGESTIONS : suggestions}
        onChoose={choose}
        onDismiss={dismiss}
      />
    </View>
  )
}
