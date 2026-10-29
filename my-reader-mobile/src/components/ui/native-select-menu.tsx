import { useRef, type ReactNode } from "react"
import { Platform, StyleSheet } from "react-native"
import { MenuView, type MenuComponentRef } from "@react-native-menu/menu"
import { View } from "@/tw"
import { IosSelectMenu, type SelectMenuAction } from "./ios-select-menu"

/** Keeps the native menu anchored to the same trigger that provides press feedback. */
export function NativeSelectMenu({
  label,
  actions,
  disabled,
  onSelect,
  isAnchoredToRight,
  children,
}: {
  label: string
  actions: SelectMenuAction[]
  disabled?: boolean
  onSelect: (id: string) => void
  isAnchoredToRight?: boolean
  children: (open: () => void) => ReactNode
}) {
  const menuRef = useRef<MenuComponentRef>(null)
  if (Platform.OS === "ios") {
    return (
      <IosSelectMenu
        label={label}
        actions={disabled ? [] : actions}
        onSelect={onSelect}
      >
        {children(() => {})}
      </IosSelectMenu>
    )
  }
  return (
    <View>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: 0 }]}
      >
        <MenuView
          ref={menuRef}
          actions={actions}
          isAnchoredToRight={isAnchoredToRight}
          onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
          style={StyleSheet.absoluteFill}
        >
          <View style={StyleSheet.absoluteFill} />
        </MenuView>
      </View>
      {children(() => {
        if (!disabled) menuRef.current?.show()
      })}
    </View>
  )
}
