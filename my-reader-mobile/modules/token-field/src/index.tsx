import { requireNativeView } from "expo"
import type { Ref } from "react"
import type { ViewProps } from "react-native"

export type SearchToken = { id: string; label: string }
export type TokenFieldValue = { text: string; tokens: SearchToken[] }
export type TokenFieldHandle = { focus: () => Promise<void> }

type Props = ViewProps & {
  ref?: Ref<TokenFieldHandle>
  value: TokenFieldValue & { eventCount: number }
  placeholder: string
  textColor: string
  accentColor: string
  fieldColor: string
  onTokenFieldChange: (event: {
    nativeEvent: TokenFieldValue & { eventCount: number }
  }) => void
  onTokenFieldSubmit: (event: { nativeEvent: { text: string } }) => void
}

export const NativeTokenField = requireNativeView<Props>("MyReaderTokenField")
