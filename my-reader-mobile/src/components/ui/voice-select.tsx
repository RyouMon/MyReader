import { type ComponentProps, useState } from "react"
import { useTranslation } from "react-i18next"
import { FlatList, Keyboard, useWindowDimensions } from "react-native"
import { TouchableRipple } from "react-native-paper"
import { useThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"
import { IconButton } from "./button"
import { type FormSelect, FormSelectTrigger } from "./form-select"
import type { SelectMenuAction } from "./ios-select-menu"
import { PlatformIcon } from "./platform-icon"
import { SelectPopover } from "./select-popover"

export type VoiceSelectPreviewProps = {
  previewVoiceId: string | null
  onPreview: (voiceId: string) => void
  onStopPreview: () => void
}

export function VoiceSelect({
  actions,
  onSelect,
  previewVoiceId,
  onPreview,
  onStopPreview,
  disabled,
  ...field
}: ComponentProps<typeof FormSelect> & VoiceSelectPreviewProps) {
  const { t } = useTranslation()
  const palette = { ...useThemePalette(), ...field.colors }
  const voices = actions.filter(
    (action): action is SelectMenuAction & { id: string } =>
      action.id !== undefined,
  )
  const [visible, setVisible] = useState(false)
  const window = useWindowDimensions()
  const [contentHeight, setContentHeight] = useState(window.height * 0.5)
  const close = () => {
    onStopPreview()
    setVisible(false)
  }
  return (
    <SelectPopover
      visible={visible}
      onDismiss={close}
      backgroundColor={palette.surface}
      trigger={
        <FormSelectTrigger
          {...field}
          disabled={disabled || voices.length === 0}
          onPress={() => {
            Keyboard.dismiss()
            setVisible(true)
          }}
        />
      }
    >
      {(width) => (
        <FlatList
          style={{
            width,
            height: Math.min(contentHeight, window.height * 0.5),
          }}
          onContentSizeChange={(_width, height) => setContentHeight(height)}
          data={voices}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const playing = previewVoiceId === item.id
            const action = t(
              playing
                ? "settings.tts.previewPlaying"
                : "settings.tts.previewAction",
            )
            return (
              <View className="flex-row items-center pr-1">
                <TouchableRipple
                  style={{ flex: 1 }}
                  accessibilityRole="radio"
                  accessibilityLabel={item.title}
                  accessibilityState={{ checked: item.state === "on" }}
                  onPress={() => {
                    close()
                    onSelect(item.id)
                  }}
                  rippleColor={palette.backgroundSecondary}
                >
                  <View className="min-h-12 flex-row items-center gap-2 px-3 py-2">
                    <View className="w-5">
                      {item.state === "on" ? (
                        <PlatformIcon
                          name={{ ios: "checkmark", android: "check" }}
                          size={20}
                          color={palette.primary}
                        />
                      ) : null}
                    </View>
                    <Text
                      className="flex-1 text-base"
                      numberOfLines={2}
                      style={{ color: palette.text }}
                    >
                      {item.title}
                    </Text>
                  </View>
                </TouchableRipple>
                <IconButton
                  size="sm"
                  tone="primary"
                  colors={palette}
                  label={`${action} · ${item.title}`}
                  icon={{
                    ios: playing ? "stop" : "play",
                    android: playing ? "stop" : "play-arrow",
                  }}
                  onPress={() =>
                    playing ? onStopPreview() : onPreview(item.id)
                  }
                />
              </View>
            )
          }}
        />
      )}
    </SelectPopover>
  )
}
