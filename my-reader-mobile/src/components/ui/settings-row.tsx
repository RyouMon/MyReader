import { useCallback, useRef, type ReactNode } from "react";
import {
  ActionSheetIOS,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  TouchableNativeFeedback,
  type ViewStyle,
} from "react-native";

import { MenuView, type MenuAction, type MenuComponentRef } from "@react-native-menu/menu";
import { useTranslation } from "react-i18next";
import chroma from "chroma-js";

import { mixInk } from "@/src/design/reader-chrome-palette";
import { useTheme, useThemePalette, type ThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

const ROW_CLASS = "flex-row items-center justify-between gap-3 px-4 py-4";
const TITLE_CLASS = "text-[16px] leading-6";
const DETAIL_CLASS = "text-[13px] leading-5";
const HIDDEN_MENU_ANCHOR_STYLE: ViewStyle = {
  ...StyleSheet.absoluteFill,
  opacity: 0,
};

function settingsRowPressedBackground(colorScheme: "light" | "dark", palette: ThemePalette) {
  if (colorScheme === "light") {
    return mixInk(palette.text, palette.surface, 12);
  }

  return chroma(palette.surface).brighten(0.5).hex();
}

function settingsRowAndroidPressBackground(colorScheme: "light" | "dark", palette: ThemePalette) {
  if (colorScheme === "light") {
    return TouchableNativeFeedback.Ripple(chroma(palette.text).alpha(0.14).css(), false);
  }

  return TouchableNativeFeedback.SelectableBackground();
}

function rowSeparatorStyle(isLast: boolean | undefined, palette: ThemePalette): ViewStyle {
  return {
    borderBottomColor: palette.borderStrong,
    borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
  };
}

type SettingsRowProps = {
  title: string;
  /** Muted secondary text shown below the title. */
  detail?: string;
  /** Right-side label (same size as title, muted color). */
  value?: string;
  onPress?: () => void;
  isLast?: boolean;
};

type SettingsMenuRowProps = Omit<SettingsRowProps, "onPress"> & {
  actions: MenuAction[];
  onPressAction: (event: { nativeEvent: { event: string } }) => void;
  isAnchoredToRight?: boolean;
};

function SettingsRowBody({
  title,
  detail,
  value,
  palette,
}: Pick<SettingsRowProps, "title" | "detail" | "value"> & { palette: ThemePalette }) {
  const hasValue = value != null && value.length > 0;

  return (
    <>
      <View className="flex-1 gap-1">
        <Text selectable className={TITLE_CLASS} style={{ color: palette.text }}>
          {title}
        </Text>
        {detail ? (
          <Text selectable className={DETAIL_CLASS} style={{ color: palette.textMuted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {hasValue ? (
        <Text selectable className={`shrink ${TITLE_CLASS}`} style={{ color: palette.textMuted }}>
          {value}
        </Text>
      ) : null}
    </>
  );
}

function SettingsRowPressable({
  onPress,
  isLast,
  omitSeparator,
  children,
}: {
  onPress?: () => void;
  isLast?: boolean;
  omitSeparator?: boolean;
  children: ReactNode;
}) {
  const { colorScheme } = useTheme();
  const palette = useThemePalette();
  const resolvedScheme = colorScheme === "dark" ? "dark" : "light";
  const rowPressedBackground = settingsRowPressedBackground(resolvedScheme, palette);
  const androidPressBackground = settingsRowAndroidPressBackground(resolvedScheme, palette);
  const separatorStyle = omitSeparator ? undefined : rowSeparatorStyle(isLast, palette);

  if (!onPress) {
    return (
      <View className={ROW_CLASS} style={separatorStyle}>
        {children}
      </View>
    );
  }

  if (Platform.OS === "android") {
    return (
      <View style={separatorStyle}>
        <TouchableNativeFeedback
          accessibilityRole="button"
          background={androidPressBackground}
          onPress={onPress}
        >
          <View className={ROW_CLASS} style={{ backgroundColor: palette.surface }}>
            {children}
          </View>
        </TouchableNativeFeedback>
      </View>
    );
  }

  return (
    <View style={separatorStyle}>
      <RNPressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.pressableRow,
          { backgroundColor: pressed ? rowPressedBackground : palette.surface },
        ]}
      >
        <View className={ROW_CLASS}>{children}</View>
      </RNPressable>
    </View>
  );
}

function showIOSMenuActionSheet(
  actions: MenuAction[],
  cancelLabel: string,
  onPressAction: SettingsMenuRowProps["onPressAction"],
) {
  const cancelButtonIndex = actions.length;

  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: [...actions.map((action) => action.title), cancelLabel],
      cancelButtonIndex,
    },
    (buttonIndex) => {
      if (buttonIndex === undefined || buttonIndex === cancelButtonIndex) {
        return;
      }

      const action = actions[buttonIndex];
      if (action?.id) {
        onPressAction({ nativeEvent: { event: action.id } });
      }
    },
  );
}

/** Settings row that opens a native menu with the same press feedback as SettingsRow. */
export function SettingsMenuRow({
  actions,
  onPressAction,
  isAnchoredToRight,
  title,
  detail,
  value,
  isLast,
}: SettingsMenuRowProps) {
  const { t } = useTranslation();
  const menuRef = useRef<MenuComponentRef>(null);
  const palette = useThemePalette();
  const body = <SettingsRowBody title={title} detail={detail} value={value} palette={palette} />;

  const handlePress = useCallback(() => {
    if (Platform.OS === "ios") {
      showIOSMenuActionSheet(actions, t("common.cancel"), onPressAction);
      return;
    }

    menuRef.current?.show();
  }, [actions, onPressAction, t]);

  if (Platform.OS === "android") {
    return (
      <View style={rowSeparatorStyle(isLast, palette)}>
        <View pointerEvents="none" style={HIDDEN_MENU_ANCHOR_STYLE}>
          <MenuView
            ref={menuRef}
            actions={actions}
            isAnchoredToRight={isAnchoredToRight}
            onPressAction={onPressAction}
            style={styles.menuAnchorFill}
          >
            <View style={styles.menuAnchorFill} />
          </MenuView>
        </View>
        <SettingsRowPressable omitSeparator onPress={handlePress}>
          {body}
        </SettingsRowPressable>
      </View>
    );
  }

  return (
    <SettingsRowPressable isLast={isLast} onPress={handlePress}>
      {body}
    </SettingsRowPressable>
  );
}

export function SettingsRow({
  title,
  detail,
  value,
  onPress,
  isLast,
}: SettingsRowProps) {
  const palette = useThemePalette();
  const body = <SettingsRowBody title={title} detail={detail} value={value} palette={palette} />;

  return (
    <SettingsRowPressable onPress={onPress} isLast={isLast}>
      {body}
    </SettingsRowPressable>
  );
}

const styles = StyleSheet.create({
  pressableRow: {
    width: "100%",
  },
  menuAnchorFill: {
    flex: 1,
  },
});
