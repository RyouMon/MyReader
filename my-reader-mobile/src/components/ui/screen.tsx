import { useRef, useState, type ReactNode } from "react"
import {
  KeyboardAvoidingView,
  Platform,
  View as NativeView,
} from "react-native"

import { useThemePalette } from "@/src/design/tokens"
import { ScrollView, View } from "@/tw"

export function Screen({
  children,
  contentContainerClassName,
  scrollEnabled = true,
}: {
  children: ReactNode
  /** Appended to default horizontal/top padding and bottom inset for scroll content. */
  contentContainerClassName?: string
  scrollEnabled?: boolean
}) {
  const palette = useThemePalette()
  const frame = useRef<NativeView>(null)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const bottomPad = ["px-4 pt-4 pb-10", contentContainerClassName]
    .filter(Boolean)
    .join(" ")

  const content = (
    <ScrollView
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName={bottomPad}
      scrollEnabled={scrollEnabled}
      style={{ backgroundColor: palette.background }}
    >
      <View className="gap-5">{children}</View>
    </ScrollView>
  )

  if (Platform.OS !== "android") return content

  return (
    <NativeView
      ref={frame}
      style={{ flex: 1 }}
      onLayout={() => {
        // Form sheets and stack headers place the scroll area below the window origin.
        frame.current?.measureInWindow((_x, y) => setKeyboardOffset(y))
      }}
    >
      <KeyboardAvoidingView
        behavior="height"
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        {content}
      </KeyboardAvoidingView>
    </NativeView>
  )
}
