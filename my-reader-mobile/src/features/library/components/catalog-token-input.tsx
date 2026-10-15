import { parseCatalogTokens } from "@my-reader/tools/catalog-navigation"
import { useImperativeHandle, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useWindowDimensions } from "react-native"
import {
  NativeTokenField,
  type TokenFieldHandle,
  type SearchToken,
} from "@/modules/token-field/src"
import { useThemePalette } from "@/src/design/tokens"
import type { CatalogTokenInputProps } from "./catalog-token-input.types"

function decodeTokens(tokens: SearchToken[]) {
  return parseCatalogTokens(
    tokens.flatMap(({ id }) => {
      try {
        return [JSON.parse(id)]
      } catch {
        return []
      }
    }),
  )
}

export default function CatalogTokenInput({
  ref,
  tokens,
  text,
  placeholder,
  onChange,
  onSubmit,
  onHeightChange,
}: CatalogTokenInputProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { fontScale } = useWindowDimensions()
  const input = useRef<TokenFieldHandle>(null)
  const [eventCount, setEventCount] = useState(0)
  useImperativeHandle(ref, () => ({
    focus: () => void input.current?.focus(),
  }))
  return (
    <NativeTokenField
      ref={input}
      style={{ height: Math.max(44, 32 + 17 * fontScale) }}
      onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)}
      value={{
        text,
        eventCount,
        tokens: tokens.map((token) => ({
          id: JSON.stringify(token),
          label: `${t(`catalog.${token.kind}`)}: ${token.value}`,
        })),
      }}
      placeholder={placeholder}
      textColor={palette.text}
      accentColor={palette.primary}
      fieldColor={palette.surface}
      onTokenFieldChange={({ nativeEvent }) => {
        setEventCount(nativeEvent.eventCount)
        onChange(decodeTokens(nativeEvent.tokens), nativeEvent.text)
      }}
      onTokenFieldSubmit={({ nativeEvent }) => onSubmit(nativeEvent.text)}
    />
  )
}
