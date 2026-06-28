import { MenuView, type MenuComponentRef } from "@react-native-menu/menu"
import type { RefObject } from "react"
import { View, type ImageSourcePropType } from "react-native"

import {
  ANDROID_HEADER_ICON_SIZE,
  AndroidHeaderSlot,
  type AndroidHeaderSlotSide,
} from "./android-header-layout"
import { AndroidHeaderIconButton } from "./android-header-icon-button"

type AndroidHeaderMenuButtonProps = {
  menuRef: RefObject<MenuComponentRef | null>
  actions: Parameters<typeof MenuView>[0]["actions"]
  onPressAction: (event: string) => void
  icon: ImageSourcePropType
  accessibilityLabel: string
  side?: AndroidHeaderSlotSide
  anchoredToRight?: boolean
}

/** Header icon button that opens a native MenuView anchored to the same slot. */
export function AndroidHeaderMenuButton({
  menuRef,
  actions,
  onPressAction,
  icon,
  accessibilityLabel,
  side = "left",
  anchoredToRight = false,
}: AndroidHeaderMenuButtonProps) {
  return (
    <AndroidHeaderSlot side={side}>
      <View
        style={{
          width: ANDROID_HEADER_ICON_SIZE,
          height: ANDROID_HEADER_ICON_SIZE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MenuView
          ref={menuRef}
          actions={actions}
          isAnchoredToRight={anchoredToRight}
          onPressAction={({ nativeEvent }) => onPressAction(nativeEvent.event)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: ANDROID_HEADER_ICON_SIZE,
            height: ANDROID_HEADER_ICON_SIZE,
            opacity: 0,
          }}
        >
          <View
            style={{
              width: ANDROID_HEADER_ICON_SIZE,
              height: ANDROID_HEADER_ICON_SIZE,
            }}
          />
        </MenuView>
        <AndroidHeaderIconButton
          icon={icon}
          accessibilityLabel={accessibilityLabel}
          onPress={() => menuRef.current?.show()}
        />
      </View>
    </AndroidHeaderSlot>
  )
}
