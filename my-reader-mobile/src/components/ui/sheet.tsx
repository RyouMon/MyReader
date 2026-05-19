import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable as RNPressable } from "react-native";

import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text, View } from "@/tw";

export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const palette = useThemePalette();

  return (
    <Modal transparent animationType="fade" visible={open} onRequestClose={onClose}>
      <RNPressable
        onPress={onClose}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: palette.overlay }}
      >
        <RNPressable>
          <View
            className="rounded-t-[28px] px-4 pb-8 pt-4"
            style={{
              backgroundColor: palette.surface,
              borderTopWidth: 1,
              borderColor: palette.border,
            }}
          >
            <View className="mb-4 self-center rounded-full" style={{ width: 36, height: 4, backgroundColor: palette.border }} />
            <View className="gap-4">{children}</View>
          </View>
        </RNPressable>
      </RNPressable>
    </Modal>
  );
}

export function SheetOption({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const palette = useThemePalette();

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-12 flex-row items-center justify-between rounded-2xl px-4"
      onPress={onPress}
      style={{ backgroundColor: active ? palette.backgroundSecondary : "transparent" }}
    >
      <Text className="text-[16px]" style={{ color: palette.text, fontWeight: active ? "700" : "600" }}>
        {label}
      </Text>
      {active ? (
        <Text className="text-sm font-semibold" style={{ color: palette.primary }}>
          {t("common.current")}
        </Text>
      ) : null}
    </Pressable>
  );
}
