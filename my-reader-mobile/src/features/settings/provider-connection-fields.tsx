import { useTranslation } from "react-i18next"
import { FormSwitch } from "@/src/components"
import type { useFormValidation } from "@/src/components/ui/use-form-validation"
import { useThemePalette } from "@/src/design/tokens"
import { View } from "@/tw"
import { ProviderTextField } from "./provider-text-field"

type Connection = {
  name: string
  endpoint: string
  credential: string
  clearCredential: boolean
  hasCredential: boolean
}

export function ProviderConnectionFields({
  value,
  kind,
  credentialPlaceholder,
  onChange,
  validation,
}: {
  value: Connection
  kind: "tts" | "llm"
  credentialPlaceholder?: string
  onChange: (value: Connection) => void
  validation: ReturnType<typeof useFormValidation>
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const labels =
    kind === "tts"
      ? ({
          name: "settings.tts.profileName",
          endpoint: "settings.tts.endpoint",
          key: "settings.tts.credential",
          saved: "settings.tts.credentialSaved",
          clear: "settings.tts.clearCredential",
        } as const)
      : ({
          name: "llm.name",
          endpoint: "llm.endpoint",
          key: "llm.key",
          saved: "llm.keySaved",
          clear: "llm.clearKey",
        } as const)
  return (
    <View className="gap-3">
      {(["name", "endpoint"] as const).map((field) => (
        <ProviderTextField
          key={field}
          label={t(labels[field])}
          testID={`${kind}-provider-${field}`}
          required
          value={value[field]}
          {...validation.field(field)}
          onChangeText={(text) => onChange({ ...value, [field]: text })}
        />
      ))}
      <ProviderTextField
        label={t(labels.key)}
        testID={`${kind}-provider-credential`}
        value={value.credential}
        secureTextEntry
        textContentType="none"
        placeholder={
          value.hasCredential ? t(labels.saved) : credentialPlaceholder
        }
        onChangeText={(credential) =>
          onChange({ ...value, credential, clearCredential: false })
        }
      />
      {value.hasCredential ? (
        <FormSwitch
          label={t(labels.clear)}
          activeTrackColor={palette.danger}
          value={value.clearCredential}
          onValueChange={(clearCredential) =>
            onChange({ ...value, clearCredential, credential: "" })
          }
        />
      ) : null}
    </View>
  )
}
