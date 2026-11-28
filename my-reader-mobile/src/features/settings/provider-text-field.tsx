import { memo, type ComponentProps } from "react"
import { FormTextField } from "@/src/components"

export const ProviderTextField = memo(function ProviderTextField(
  props: ComponentProps<typeof FormTextField>,
) {
  return <FormTextField autoCapitalize="none" autoCorrect={false} {...props} />
})
