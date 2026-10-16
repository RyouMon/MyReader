import { type MenuComponentRef, MenuView } from "@react-native-menu/menu"
import type { RefObject } from "react"
import { type ImageSourcePropType, View } from "react-native"
import { AndroidHeaderIconButton } from "./android-header-icon-button"
import { ANDROID_HEADER_BUTTON_SIZE } from "./android-header-layout"

type AndroidHeaderMenuButtonProps = {
  menuRef: RefObject<MenuComponentRef | null>
  actions: Parameters<typeof MenuView>[0]["actions"]
  onPressAction: (event: string) => void
  icon: ImageSourcePropType
  accessibilityLabel: string
  anchoredToRight?: boolean
}

/** Header icon button that opens a native MenuView anchored to the same slot. */
export function AndroidHeaderMenuButton({
  menuRef,
  actions,
  onPressAction,
  icon,
  accessibilityLabel,
  anchoredToRight = false,
}: AndroidHeaderMenuButtonProps) {
  return (
    <View>
      <MenuView
        ref={menuRef}
        actions={actions}
        isAnchoredToRight={anchoredToRight}
        onPressAction={({ nativeEvent }) => onPressAction(nativeEvent.event)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: ANDROID_HEADER_BUTTON_SIZE,
          height: ANDROID_HEADER_BUTTON_SIZE,
          opacity: 0,
        }}
      >
        <View
          style={{
            width: ANDROID_HEADER_BUTTON_SIZE,
            height: ANDROID_HEADER_BUTTON_SIZE,
          }}
        />
      </MenuView>
      <AndroidHeaderIconButton
        icon={icon}
        accessibilityLabel={accessibilityLabel}
        onPress={() => menuRef.current?.show()}
      />
    </View>
  )
}
