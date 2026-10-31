import { BottomSheetScrollView } from "@expo/ui/community/bottom-sheet"
import type { ReactNode } from "react"
import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { View } from "@/tw"

export function ReaderSheetPage({
  children,
  footer,
}: {
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <BottomSheetScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </BottomSheetScrollView>
      {footer}
    </KeyboardAvoidingView>
  )
}

export function ReaderSheetFooter({
  palette,
  children,
  status,
}: {
  palette: ReaderChromePalette
  children: ReactNode
  status?: ReactNode
}) {
  return (
    <View
      style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
      }}
    >
      {status ? <View className="px-5 pt-2">{status}</View> : null}
      <View className="flex-row items-center gap-2 px-5 py-2">{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 16,
  },
})
