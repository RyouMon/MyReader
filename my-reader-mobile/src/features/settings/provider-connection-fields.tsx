import { useTranslation } from "react-i18next"
import { FormPasswordField } from "@/src/components"
import type { useFormValidation } from "@/src/components/ui/use-form-validation"
import { View } from "@/tw"
import { ProviderTextField } from "./provider-text-field"

type Connection = {
  name: string
  endpoint: string
  credential: string
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
      <FormPasswordField
        label={t(labels.key)}
        testID={`${kind}-provider-credential`}
        value={value.credential}
        placeholder={credentialPlaceholder}
        onChangeText={(credential) => onChange({ ...value, credential })}
      />
    </View>
  )
}
