import type { ReactNode } from "react"
import { View, type ViewStyle } from "react-native"

/** Material top app bar icon touch target (dp). */
export const ANDROID_HEADER_ICON_SIZE = 24

/** Distance from screen edge to the icon button. Applied as View margin (native stack ignores containerStyle props). */
export const ANDROID_HEADER_EDGE_INSET = 0

/** Extra space between the leading icon slot and the title. Applied as trailing margin on left actions. */
export const ANDROID_HEADER_TITLE_LEADING_GAP = 12

export type AndroidHeaderSlotSide = "left" | "right"

/** Margin styles that actually affect Android native-stack custom header slots. */
export function androidHeaderSlotStyle(side: AndroidHeaderSlotSide): ViewStyle {
  if (side === "left") {
    return {
      marginStart: ANDROID_HEADER_EDGE_INSET,
      marginEnd: ANDROID_HEADER_TITLE_LEADING_GAP,
    }
  }

  return {
    marginStart: 0,
    marginEnd: ANDROID_HEADER_EDGE_INSET,
  }
}

type AndroidHeaderSlotProps = {
  side: AndroidHeaderSlotSide
  children: ReactNode
}

/** Fixed-size header icon slot so actions align with the title bar vertically. */
export function AndroidHeaderSlot({ side, children }: AndroidHeaderSlotProps) {
  return (
    <View
      style={{
        width: ANDROID_HEADER_ICON_SIZE,
        height: ANDROID_HEADER_ICON_SIZE,
        alignItems: "center",
        justifyContent: "center",
        ...androidHeaderSlotStyle(side),
      }}
    >
      {children}
    </View>
  )
}

/** Wraps a header action renderer so it occupies the standard icon slot. */
export function wrapAndroidHeaderAction(
  side: AndroidHeaderSlotSide,
  render: () => ReactNode,
): () => ReactNode {
  return () => <AndroidHeaderSlot side={side}>{render()}</AndroidHeaderSlot>
}
