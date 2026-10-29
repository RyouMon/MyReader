import { Pressable, Text, TextInput, View } from "react-native"
import type { ComponentProps } from "react"
import type { FormSelect as Select } from "@/src/components/ui/form-select"
import type { FormTextField as Field } from "@/src/components/ui/form-text-field"

// Screen tests exercise form state; native menu triggers have their own component tests.
export function FormSelect({
  label,
  value,
  actions,
  onSelect,
  disabled,
}: ComponentProps<typeof Select>) {
  return (
    <View>
      <Text>{label}</Text>
      <Text>{value}</Text>
      {actions.map((action) => (
        <Pressable
          key={action.id}
          accessibilityRole="button"
          accessibilityLabel={action.id}
          disabled={disabled}
          onPress={() => onSelect(action.id!)}
        >
          <Text>{`${label}:${action.id}`}</Text>
        </Pressable>
      ))}
    </View>
  )
}

export function FormTextField({
  label,
  error,
  ...props
}: ComponentProps<typeof Field>) {
  return (
    <View>
      <TextInput
        {...(props as ComponentProps<typeof TextInput>)}
        accessibilityLabel={label}
      />
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    </View>
  )
}
