import { Group, Host, Popover, RNHostView } from "@expo/ui/swift-ui"
import { presentationBackground } from "@expo/ui/swift-ui/modifiers"
import { type Context, useState } from "react"
import { ScrollView, useWindowDimensions } from "react-native"
import { useTheme } from "@/src/design/tokens"
import { View } from "@/tw"
import type { SelectPopoverProps } from "./select-popover.types"

// React Native exposes this static in its generated types, but not its legacy types.
const ScrollViewContext = (
  ScrollView as typeof ScrollView & {
    Context: Context<{ horizontal: boolean } | null>
  }
).Context

export function SelectPopover({
  visible,
  onDismiss,
  backgroundColor,
  trigger,
  children,
}: SelectPopoverProps) {
  const { colorScheme } = useTheme()
  const window = useWindowDimensions()
  const [width, setWidth] = useState<number>()
  return (
    <View onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
      <Host
        matchContents={{ vertical: true }}
        colorScheme={colorScheme === "dark" ? "dark" : "light"}
        ignoreSafeArea="all"
      >
        <Popover
          isPresented={visible}
          onIsPresentedChange={(open) => {
            if (!open) onDismiss()
          }}
          attachmentAnchor="bottom"
        >
          <Popover.Trigger>
            <RNHostView matchContents>
              <View style={{ width }}>{trigger}</View>
            </RNHostView>
          </Popover.Trigger>
          <Popover.Content>
            {/* Like RN Modal, the native presentation has its own scroll container. */}
            <ScrollViewContext.Provider value={null}>
              <Group modifiers={[presentationBackground(backgroundColor)]}>
                <RNHostView matchContents>
                  <View className="py-2" style={{ backgroundColor }}>
                    {children(
                      Math.min(width ?? window.width - 32, window.width - 32),
                    )}
                  </View>
                </RNHostView>
              </Group>
            </ScrollViewContext.Provider>
          </Popover.Content>
        </Popover>
      </Host>
    </View>
  )
}
