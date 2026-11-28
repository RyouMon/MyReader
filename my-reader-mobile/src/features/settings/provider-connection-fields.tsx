import { useCallback, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { View as NativeView } from "react-native"
import {
  AnchoredSuggestions,
  FormPasswordField,
  type SuggestionOverlayItem,
} from "@/src/components"
import type { useFormValidation } from "@/src/components/ui/use-form-validation"
import { View } from "@/tw"
import { ProviderTextField } from "./provider-text-field"

type Connection = {
  name: string
  endpoint: string
  credential: string
}

export type EndpointSuggestionOption = {
  label: string
  value: string
}

const NO_SUGGESTIONS: readonly SuggestionOverlayItem[] = []

export function ProviderConnectionFields({
  value,
  kind,
  credentialPlaceholder,
  credentialError,
  endpointSuggestions,
  endpointSuggestionsLabel,
  onChange,
  validation,
}: {
  value: Connection
  kind: "tts" | "llm"
  credentialPlaceholder?: string
  credentialError?: string
  endpointSuggestions?: readonly EndpointSuggestionOption[]
  endpointSuggestionsLabel?: string
  onChange: (value: Connection) => void
  validation: ReturnType<typeof useFormValidation>
}) {
  const { t } = useTranslation()
  const endpointAnchor = useRef<NativeView>(null)
  const latestValue = useRef(value)
  latestValue.current = value
  const [endpointFocused, setEndpointFocused] = useState(false)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
  const showSuggestions =
    endpointFocused &&
    !suggestionsDismissed &&
    !value.endpoint.trim() &&
    Boolean(endpointSuggestions?.length)

  const overlayItems = useMemo<readonly SuggestionOverlayItem[]>(() => {
    if (!showSuggestions || !endpointSuggestions?.length) return NO_SUGGESTIONS
    return endpointSuggestions.map((option) => ({
      key: option.value,
      title: option.label,
      detail: option.value,
      label: `${option.label}, ${option.value}`,
    }))
  }, [endpointSuggestions, showSuggestions])

  const handleChooseSuggestion = useCallback(
    (item: SuggestionOverlayItem) => {
      setSuggestionsDismissed(true)
      onChange({ ...latestValue.current, endpoint: item.key })
    },
    [onChange],
  )

  const handleDismissSuggestions = useCallback(() => {
    setSuggestionsDismissed(true)
  }, [])

  const labels =
    kind === "tts"
      ? ({
          name: "settings.tts.profileName",
          endpoint: "settings.tts.endpoint",
          key: "settings.tts.credential",
        } as const)
      : ({
          name: "llm.name",
          endpoint: "llm.endpoint",
          key: "llm.key",
        } as const)
  const endpointField = validation.field("endpoint")

  return (
    <View className="gap-3">
      <ProviderTextField
        label={t(labels.name)}
        testID={`${kind}-provider-name`}
        required
        value={value.name}
        {...validation.field("name")}
        onChangeText={(name) => onChange({ ...value, name })}
      />
      <NativeView ref={endpointAnchor} collapsable={false}>
        <ProviderTextField
          label={t(labels.endpoint)}
          testID={`${kind}-provider-endpoint`}
          required
          value={value.endpoint}
          error={endpointField.error}
          onFocus={() => {
            setEndpointFocused(true)
            setSuggestionsDismissed(false)
          }}
          onPressIn={() => {
            if (!value.endpoint.trim()) {
              setEndpointFocused(true)
              setSuggestionsDismissed(false)
            }
          }}
          onBlur={() => {
            endpointField.onBlur()
            setEndpointFocused(false)
          }}
          onChangeText={(endpoint) => {
            if (!endpoint.trim()) setSuggestionsDismissed(false)
            onChange({ ...value, endpoint })
          }}
        />
        {endpointSuggestions?.length ? (
          <AnchoredSuggestions
            anchor={endpointAnchor}
            items={overlayItems}
            accessibilityLabel={endpointSuggestionsLabel ?? t(labels.endpoint)}
            onChoose={handleChooseSuggestion}
            onDismiss={handleDismissSuggestions}
            rowHeight={72}
            gap={4}
            listTestID={`${kind}-endpoint-suggestions`}
            dismissTestID={`${kind}-endpoint-suggestions-dismiss`}
          />
        ) : null}
      </NativeView>
      <FormPasswordField
        label={t(labels.key)}
        testID={`${kind}-provider-credential`}
        value={value.credential}
        placeholder={credentialPlaceholder}
        error={credentialError}
        onChangeText={(credential) => onChange({ ...value, credential })}
      />
    </View>
  )
}
