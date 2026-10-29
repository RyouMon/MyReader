import { type ReactNode } from "react"
import { useThemePalette } from "@/src/design/tokens"
import { View } from "@/tw"

/** Actions stay beside the input; details indent on the left and retain the form's right edge. */
export function FormInputRow({
  children,
  actions,
  details,
}: {
  children: ReactNode
  actions: ReactNode
  details?: ReactNode
}) {
  const palette = useThemePalette()
  return (
    <View className="gap-3">
      <View className="flex-row items-start gap-1">
        <View className="min-w-0 flex-1">{children}</View>
        <View className="flex-row pt-2">{actions}</View>
      </View>
      {details ? (
        <View className="ml-4 pb-3">
          <View
            className="border-l pl-3"
            style={{ borderColor: palette.border }}
          >
            {details}
          </View>
        </View>
      ) : null}
    </View>
  )
}
