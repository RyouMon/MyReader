import { Host, Icon, IconButton } from "@expo/ui/jetpack-compose";
import { Pressable } from "react-native";
import { useTranslation } from "react-i18next";

import ArrowBackIcon from "@expo/material-symbols/arrow_back.xml";

import { useTheme } from "@/src/design/tokens";

type HeaderBackButtonProps = {
  onPress: () => void;
};

/** Android stack header back control with Material icon button and native ripple. */
export function HeaderBackButton({ onPress }: HeaderBackButtonProps) {
  const { palette, colorScheme } = useTheme();
  const { t } = useTranslation();
  const isDark = colorScheme === "dark";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("reader.back")}
      testID="header-back-button"
      android_ripple={{
        color: isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.12)",
        borderless: true,
        radius: 24,
      }}
      hitSlop={8}
      onPress={onPress}
    >
      <Host matchContents pointerEvents="none" style={{ overflow: "visible" }}>
        <IconButton
          colors={{
            contentColor: palette.text,
          }}
          enabled
        >
          <Icon source={ArrowBackIcon} size={24} contentDescription={t("reader.back")} />
        </IconButton>
      </Host>
    </Pressable>
  );
}
