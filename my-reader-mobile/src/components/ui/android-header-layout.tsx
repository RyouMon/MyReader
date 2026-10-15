import type { ReactNode } from "react"
import { View } from "@/tw"

/** Material icon buttons reserve their full touch target in the header layout. */
export const ANDROID_HEADER_BUTTON_SIZE = 48
/** Matches the horizontal content inset supplied by Android native-stack headers. */
export const ANDROID_HEADER_EDGE_INSET = 16

type AndroidHeaderActionsProps = {
  children: ReactNode
}

/** One row per native-stack header side; each child keeps its own measured width. */
export function AndroidHeaderActions({ children }: AndroidHeaderActionsProps) {
  return <View className="flex-row items-center">{children}</View>
}

/** Let native-stack apply its edge spacing around the complete action group. */
export function wrapAndroidHeaderAction(
  render: () => ReactNode,
): () => ReactNode {
  return function AndroidHeaderAction() {
    return <AndroidHeaderActions>{render()}</AndroidHeaderActions>
  }
}
