import type { ReactNode } from "react"

import { useThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"

/**
 * 表单控制行：标签占用剩余空间，右侧放置开关等控件。
 */
export function FormLabeledFieldRow({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: ReactNode
}) {
  const palette = useThemePalette()

  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-3 pl-4">
        <View className="flex-1 justify-center">
          <Text className="text-base" style={{ color: palette.text }}>
            {label}
            {required ? <Text style={{ color: palette.error }}> *</Text> : null}
          </Text>
        </View>
        <View className="shrink-0 justify-center">{children}</View>
      </View>
      {error ? (
        <Text className="pl-3 text-xs" style={{ color: palette.error }}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}
