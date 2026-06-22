import { useCallback, useRef, type ReactNode } from "react";
import {
  ActionSheetIOS,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  TouchableNativeFeedback,
  type ViewStyle,
} from "react-native";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MenuView, type MenuAction, type MenuComponentRef } from "@react-native-menu/menu";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import chroma from "chroma-js";

import { mixInk } from "@/src/design/reader-chrome-palette";
import { useTheme, useThemePalette, type ThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

const ROW_CLASS = "flex-row items-start justify-between gap-3 px-4 py-4";
const TITLE_CLASS = "text-[16px] leading-6";
const DETAIL_CLASS = "text-[13px] leading-5";
const ROW_ICON_SIZE = 22;
const HIDDEN_MENU_ANCHOR_STYLE: ViewStyle = {
  ...StyleSheet.absoluteFill,
  opacity: 0,
};

/** Cross-platform row icon — SF Symbol on iOS, Material Icons on Android (`expo-symbols`). */
export type SettingsRowIcon = {
  ios: string;
  android: string;
};

const TITLE_LINE_HEIGHT = 24;

function settingsRowTextStyle(color: string) {
  return Platform.OS === "android"
    ? { color, includeFontPadding: false as const }
    : { color };
}

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
  /** Overrides `accessibilityLabel`; defaults to `title` when omitted. */
  label?: string;
  /** Leading icon — SF Symbol (iOS) and Material Icons name (Android). */
  icon?: SettingsRowIcon;
  /** Muted secondary text shown below the title. */
  detail?: string;
  /** Right-side label (same size as title, muted color). */
  value?: string;
  onPress?: () => void;
  isLast?: boolean;
  testID?: string;
};

type SettingsMenuRowProps = Omit<SettingsRowProps, "onPress"> & {
  actions: MenuAction[];
  onPressAction: (event: { nativeEvent: { event: string } }) => void;
  isAnchoredToRight?: boolean;
};

function SettingsRowIconView({ icon, palette }: { icon: SettingsRowIcon; palette: ThemePalette }) {
  const tintColor = palette.textMuted;

  return (
    <View style={styles.iconSlot}>
      {Platform.OS === "android" ? (
        <MaterialIcons name={icon.android as never} size={ROW_ICON_SIZE} color={tintColor} />
      ) : (
        <SymbolView
          name={{ ios: icon.ios, android: icon.android } as never}
          resizeMode="scaleAspectFit"
          size={ROW_ICON_SIZE}
          tintColor={tintColor}
        />
      )}
    </View>
  );
}

function SettingsRowBody({
  title,
  icon,
  detail,
  value,
  palette,
}: Pick<SettingsRowProps, "title" | "icon" | "detail" | "value"> & { palette: ThemePalette }) {
  const hasValue = value != null && value.length > 0;

  return (
    <>
      {icon ? <SettingsRowIconView icon={icon} palette={palette} /> : null}
      <View className="flex-1 gap-1" style={{ minWidth: 96 }}>
        <Text selectable className={TITLE_CLASS} numberOfLines={1} style={settingsRowTextStyle(palette.text)}>
          {title}
        </Text>
        {detail ? (
          <Text selectable className={DETAIL_CLASS} numberOfLines={1} style={settingsRowTextStyle(palette.textMuted)}>
            {detail}
          </Text>
        ) : null}
      </View>
      {hasValue ? (
        <Text
          selectable
          className={`shrink ${TITLE_CLASS}`}
          style={[settingsRowTextStyle(palette.textMuted), { flexShrink: 1 }]}
        >
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
  accessibilityLabel,
  testID,
  children,
}: {
  onPress?: () => void;
  isLast?: boolean;
  omitSeparator?: boolean;
  accessibilityLabel?: string;
  testID?: string;
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
      <View testID={testID} className={ROW_CLASS} style={separatorStyle}>
        {children}
      </View>
    );
  }

  if (Platform.OS === "android") {
    return (
      <TouchableNativeFeedback
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        background={androidPressBackground}
        onPress={onPress}
      >
        <View className={ROW_CLASS} style={[separatorStyle, { backgroundColor: palette.surface }]}>
          {children}
        </View>
      </TouchableNativeFeedback>
    );
  }

  return (
    <RNPressable
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressableRow,
        { backgroundColor: pressed ? rowPressedBackground : palette.surface },
      ]}
    >
      <View className={ROW_CLASS} style={separatorStyle}>
        {children}
      </View>
    </RNPressable>
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
  label,
  icon,
  detail,
  value,
  isLast,
}: SettingsMenuRowProps) {
  const { t } = useTranslation();
  const menuRef = useRef<MenuComponentRef>(null);
  const palette = useThemePalette();
  const body = <SettingsRowBody title={title} icon={icon} detail={detail} value={value} palette={palette} />;

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
        <SettingsRowPressable accessibilityLabel={label ?? title} omitSeparator onPress={handlePress}>
          {body}
        </SettingsRowPressable>
      </View>
    );
  }

  return (
    <SettingsRowPressable accessibilityLabel={label ?? title} isLast={isLast} onPress={handlePress}>
      {body}
    </SettingsRowPressable>
  );
}

export function SettingsRow({
  title,
  label,
  icon,
  detail,
  value,
  onPress,
  isLast,
  testID,
}: SettingsRowProps) {
  const palette = useThemePalette();
  const body = <SettingsRowBody title={title} icon={icon} detail={detail} value={value} palette={palette} />;

  return (
    <SettingsRowPressable
      accessibilityLabel={label ?? title}
      onPress={onPress}
      isLast={isLast}
      testID={testID}
    >
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
  iconSlot: {
    width: ROW_ICON_SIZE,
    height: TITLE_LINE_HEIGHT,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
