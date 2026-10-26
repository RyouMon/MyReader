import type { ComponentProps } from "react"
import { FormTextField } from "@/src/components"

export function ProviderTextField(props: ComponentProps<typeof FormTextField>) {
  return <FormTextField autoCapitalize="none" autoCorrect={false} {...props} />
}
