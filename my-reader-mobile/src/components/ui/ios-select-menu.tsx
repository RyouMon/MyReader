import { useState, type ReactNode } from "react"
import { Button, Host, Menu, RNHostView, Toggle } from "@expo/ui/swift-ui"
import { accessibilityLabel, disabled } from "@expo/ui/swift-ui/modifiers"
import type { MenuAction } from "@expo/ui/community/menu"
import { useTheme } from "@/src/design/tokens"
import { View } from "@/tw"

export type SelectMenuAction = Pick<
  MenuAction,
  "id" | "title" | "state" | "attributes"
>

/** Native menu with a named, full-width trigger and the caller's press feedback. */
export function IosSelectMenu({
  label,
  actions,
  onSelect,
  children,
}: {
  label: string
  actions: SelectMenuAction[]
  onSelect: (id: string) => void
  children: ReactNode
}) {
  const { colorScheme } = useTheme()
  const [width, setWidth] = useState<number>()
  return (
    <View onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
      <Host
        matchContents={{ vertical: true }}
        colorScheme={colorScheme === "dark" ? "dark" : "light"}
        ignoreSafeArea="all"
      >
        <Menu
          modifiers={[
            accessibilityLabel(label),
            disabled(actions.length === 0),
          ]}
          label={
            <RNHostView matchContents>
              <View style={{ width }}>{children}</View>
            </RNHostView>
          }
        >
          {actions
            .filter((action) => !action.attributes?.hidden)
            .map((action) => {
              const id = action.id ?? action.title
              const modifiers = [disabled(Boolean(action.attributes?.disabled))]
              return action.state ? (
                <Toggle
                  key={id}
                  label={action.title}
                  isOn={action.state === "on"}
                  modifiers={modifiers}
                  onIsOnChange={() => onSelect(id)}
                />
              ) : (
                <Button
                  key={id}
                  label={action.title}
                  modifiers={modifiers}
                  role={
                    action.attributes?.destructive ? "destructive" : undefined
                  }
                  onPress={() => onSelect(id)}
                />
              )
            })}
        </Menu>
      </Host>
    </View>
  )
}
