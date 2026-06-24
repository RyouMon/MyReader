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
import chroma from "chroma-js";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";

import { mixInk } from "@/src/design/reader-chrome-palette";
import { useTheme, useThemePalette, type ThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

const ROW_CLASS = "flex-row items-start justify-between gap-3 px-4 py-4";
const ROW_ICON_SIZE = 22;
const HIDDEN_MENU_ANCHOR_STYLE: ViewStyle = {
  ...StyleSheet.absoluteFill,
  opacity: 0,
};

/** Cross-platform row icon — SF Symbol on iOS, Material Icons on Android (`expo-symbols`). */
export type ListRowIcon = {
  ios: string;
  android: string;
};

function listRowTextStyle(color: string) {
  return Platform.OS === "android"
    ? { color, includeFontPadding: false as const }
    : { color };
}

function listRowPressedBackground(colorScheme: "light" | "dark", palette: ThemePalette) {
  if (colorScheme === "light") {
    return mixInk(palette.text, palette.surface, 12);
  }

  return chroma(palette.surface).brighten(0.5).hex();
}

function listRowAndroidPressBackground(colorScheme: "light" | "dark", palette: ThemePalette) {
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

type ListRowProps = {
  title: string;
  /** Overrides `accessibilityLabel`; defaults to `title` when omitted. */
  label?: string;
  /** Leading icon — SF Symbol (iOS) and Material Icons name (Android). */
  icon?: ListRowIcon;
  /** Muted secondary text shown below the title. */
  detail?: string;
  /** Right-side label (same size as title, muted color). */
  value?: string;
  onPress?: () => void;
  isLast?: boolean;
  testID?: string;
};

type ListMenuRowProps = Omit<ListRowProps, "onPress"> & {
  actions: MenuAction[];
  onPressAction: (event: { nativeEvent: { event: string } }) => void;
  isAnchoredToRight?: boolean;
};

function ListRowIconView({ icon, palette }: { icon: ListRowIcon; palette: ThemePalette }) {
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

function ListRowBody({
  title,
  icon,
  detail,
  value,
  palette,
}: Pick<ListRowProps, "title" | "icon" | "detail" | "value"> & { palette: ThemePalette }) {
  const hasValue = value != null && value.length > 0;

  return (
    <>
      {icon ? <ListRowIconView icon={icon} palette={palette} /> : null}
      <View className="flex-1 gap-1" style={{ minWidth: 96 }}>
        <Text className="text-base font-bold" numberOfLines={1} style={listRowTextStyle(palette.text)}>
          {title}
        </Text>
        {detail ? (
          <Text className="text-base" numberOfLines={1} style={listRowTextStyle(palette.textMuted)}>
            {detail}
          </Text>
        ) : null}
      </View>
      {hasValue ? (
        <Text
          selectable
          className="shrink text-base"
          style={[listRowTextStyle(palette.textMuted), { flexShrink: 1 }]}
        >
          {value}
        </Text>
      ) : null}
    </>
  );
}

function ListRowPressable({
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
  const rowPressedBackground = listRowPressedBackground(resolvedScheme, palette);
  const androidPressBackground = listRowAndroidPressBackground(resolvedScheme, palette);
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
  onPressAction: ListMenuRowProps["onPressAction"],
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

/** Grouped list row that opens a native menu with the same press feedback as ListRow. */
export function ListMenuRow({
  actions,
  onPressAction,
  isAnchoredToRight,
  title,
  label,
  icon,
  detail,
  value,
  isLast,
}: ListMenuRowProps) {
  const { t } = useTranslation();
  const menuRef = useRef<MenuComponentRef>(null);
  const palette = useThemePalette();
  const body = <ListRowBody title={title} icon={icon} detail={detail} value={value} palette={palette} />;

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
        <ListRowPressable accessibilityLabel={label ?? title} omitSeparator onPress={handlePress}>
          {body}
        </ListRowPressable>
      </View>
    );
  }

  return (
    <ListRowPressable accessibilityLabel={label ?? title} isLast={isLast} onPress={handlePress}>
      {body}
    </ListRowPressable>
  );
}

export function ListRow({
  title,
  label,
  icon,
  detail,
  value,
  onPress,
  isLast,
  testID,
}: ListRowProps) {
  const palette = useThemePalette();
  const body = <ListRowBody title={title} icon={icon} detail={detail} value={value} palette={palette} />;

  return (
    <ListRowPressable
      accessibilityLabel={label ?? title}
      onPress={onPress}
      isLast={isLast}
      testID={testID}
    >
      {body}
    </ListRowPressable>
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
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
