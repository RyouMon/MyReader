import { useState, type ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { TextInput } from "react-native-paper"
import { FormTextField } from "./form-text-field"
import { PlatformIcon } from "./platform-icon"

export function FormPasswordField(props: ComponentProps<typeof FormTextField>) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  return (
    <FormTextField
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="off"
      importantForAutofill="no"
      // iOS still runs Keychain "Save Password?" heuristics on secureTextEntry fields
      // when textContentType is unset or "none" (mapped to ""). "oneTimeCode" opts out
      // of password manager save prompts while allowing callers to override via props.
      textContentType="oneTimeCode"
      {...props}
      secureTextEntry={!visible}
      right={
        <TextInput.Icon
          accessibilityLabel={t(
            visible ? "passwordField.hide" : "passwordField.show",
          )}
          disabled={props.disabled || props.editable === false}
          forceTextInputFocus={false}
          onPress={() => setVisible((value) => !value)}
          icon={({ size, color }) => (
            <PlatformIcon
              name={
                visible
                  ? { ios: "eye.slash", android: "visibility-off" }
                  : { ios: "eye", android: "visibility" }
              }
              size={size}
              color={color}
            />
          )}
        />
      }
    />
  )
}
