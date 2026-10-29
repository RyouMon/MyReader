import { type ReactNode } from "react"
import {
  Image,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  TouchableNativeFeedback,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native"

import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { Host, Icon as MaterialSymbolIcon } from "@expo/ui/jetpack-compose"
import { SymbolView } from "expo-symbols"

import {
  useTheme,
  useThemePalette,
  type ThemePalette,
} from "@/src/design/tokens"
import {
  pressedBackgroundColor,
  androidRippleColor,
} from "@/src/design/press-feedback"
import { Text, View } from "@/tw"
import { type SelectMenuAction } from "./ios-select-menu"
import { NativeSelectMenu } from "./native-select-menu"

const ROW_CLASS = "flex-row items-start justify-between gap-3 px-4 py-4"
const ROW_ICON_SIZE = 22

/** Cross-platform row icon — native system symbol or bundled artwork. */
export type ListRowIcon =
  | {
      ios: string
      android: string
      androidSource?: ImageSourcePropType
      iconSet?: "material"
      tone?: "onedrive" | "webdav"
      imageSource?: never
    }
  | {
      imageSource: ImageSourcePropType
      ios?: never
      android?: never
      androidSource?: never
      iconSet?: never
      tone?: never
    }

function listRowTextStyle(color: string) {
  return Platform.OS === "android"
    ? { color, includeFontPadding: false as const }
    : { color }
}

function listRowPressedBackground(
  colorScheme: "light" | "dark",
  palette: ThemePalette,
) {
  return pressedBackgroundColor(colorScheme, palette)
}

function listRowAndroidPressBackground(
  colorScheme: "light" | "dark",
  palette: ThemePalette,
) {
  if (colorScheme === "light") {
    return TouchableNativeFeedback.Ripple(
      androidRippleColor(colorScheme, palette),
      false,
    )
  }

  return TouchableNativeFeedback.SelectableBackground()
}

function rowSeparatorStyle(
  isLast: boolean | undefined,
  palette: ThemePalette,
): ViewStyle {
  return {
    borderBottomColor: palette.borderStrong,
    borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
  }
}

type ListRowProps = {
  title: string
  titleWeight?: "normal" | "bold"
  /** Overrides `accessibilityLabel`; defaults to `title` when omitted. */
  label?: string
  /** Leading icon — platform symbol or bundled artwork. */
  icon?: ListRowIcon
  /** Muted secondary text shown below the title. */
  detail?: string
  /** Right-side label (same size as title, muted color). */
  value?: string
  /** Right-side native control or custom content. Takes precedence over `value`. */
  accessory?: ReactNode
  onPress?: () => void
  isLast?: boolean
  testID?: string
  contentStyle?: StyleProp<ViewStyle>
  backgroundColor?: string
}

export type ListMenuAction = SelectMenuAction

type ListMenuRowProps = Omit<ListRowProps, "onPress"> & {
  actions: ListMenuAction[]
  onPressAction: (event: { nativeEvent: { event: string } }) => void
  isAnchoredToRight?: boolean
}

function ListRowIconView({
  icon,
  palette,
  centered,
}: {
  icon: ListRowIcon
  palette: ThemePalette
  centered: boolean
}) {
  const tintColor =
    icon.tone === "onedrive"
      ? palette.brandOnedrive
      : icon.tone === "webdav"
        ? palette.dataSourceWebdav
        : palette.primary

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.iconSlot, centered && styles.centeredIconSlot]}
    >
      {icon.imageSource ? (
        <Image source={icon.imageSource} style={styles.brandIcon} />
      ) : icon.iconSet === "material" ? (
        <MaterialIcons
          name={icon.android as never}
          size={ROW_ICON_SIZE}
          color={tintColor}
        />
      ) : Platform.OS === "android" ? (
        icon.androidSource ? (
          <Host matchContents pointerEvents="none">
            <MaterialSymbolIcon
              source={icon.androidSource}
              size={ROW_ICON_SIZE}
              tint={tintColor}
            />
          </Host>
        ) : (
          <MaterialIcons
            name={icon.android as never}
            size={ROW_ICON_SIZE}
            color={tintColor}
          />
        )
      ) : (
        <SymbolView
          name={{ ios: icon.ios, android: icon.android } as never}
          resizeMode="scaleAspectFit"
          size={ROW_ICON_SIZE}
          tintColor={tintColor}
        />
      )}
    </View>
  )
}

function ListRowBody({
  title,
  titleWeight = "bold",
  icon,
  detail,
  value,
  accessory,
  palette,
}: Pick<
  ListRowProps,
  "title" | "titleWeight" | "icon" | "detail" | "value" | "accessory"
> & {
  palette: ThemePalette
}) {
  const hasValue = value != null && value.length > 0

  return (
    <>
      {icon ? (
        <ListRowIconView
          icon={icon}
          palette={palette}
          centered={Boolean(detail)}
        />
      ) : null}
      <View className="flex-1 gap-1" style={{ minWidth: 96 }}>
        <Text
          className="text-base"
          style={[listRowTextStyle(palette.text), { fontWeight: titleWeight }]}
        >
          {title}
        </Text>
        {detail ? (
          <Text
            className="text-base"
            numberOfLines={1}
            style={listRowTextStyle(palette.textMuted)}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {accessory ? (
        <View style={styles.accessorySlot}>{accessory}</View>
      ) : hasValue ? (
        <Text
          selectable
          className="shrink text-base"
          style={[listRowTextStyle(palette.textMuted), { flexShrink: 1 }]}
        >
          {value}
        </Text>
      ) : null}
    </>
  )
}

function ListRowPressable({
  onPress,
  isLast,
  omitSeparator,
  accessibilityLabel,
  testID,
  contentStyle,
  backgroundColor,
  children,
}: {
  onPress?: () => void
  isLast?: boolean
  omitSeparator?: boolean
  accessibilityLabel?: string
  testID?: string
  contentStyle?: StyleProp<ViewStyle>
  backgroundColor?: string
  children: ReactNode
}) {
  const { colorScheme } = useTheme()
  const palette = useThemePalette()
  const resolvedScheme = colorScheme === "dark" ? "dark" : "light"
  const rowPressedBackground = listRowPressedBackground(resolvedScheme, palette)
  const androidPressBackground = listRowAndroidPressBackground(
    resolvedScheme,
    palette,
  )
  const separatorStyle = omitSeparator
    ? undefined
    : rowSeparatorStyle(isLast, palette)

  if (!onPress) {
    return (
      <View
        testID={testID}
        className={ROW_CLASS}
        style={[separatorStyle, contentStyle]}
      >
        {children}
      </View>
    )
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
        <View
          className={ROW_CLASS}
          style={[
            separatorStyle,
            { backgroundColor: backgroundColor ?? palette.surface },
            contentStyle,
          ]}
        >
          {children}
        </View>
      </TouchableNativeFeedback>
    )
  }

  return (
    <RNPressable
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressableRow,
        {
          backgroundColor: pressed
            ? rowPressedBackground
            : (backgroundColor ?? palette.surface),
        },
      ]}
    >
      <View className={ROW_CLASS} style={[separatorStyle, contentStyle]}>
        {children}
      </View>
    </RNPressable>
  )
}

/** Grouped list row that opens a native menu with the same press feedback as ListRow. */
export function ListMenuRow({
  actions,
  onPressAction,
  isAnchoredToRight,
  title,
  titleWeight,
  label,
  icon,
  detail,
  value,
  accessory,
  isLast,
  contentStyle,
  backgroundColor,
  testID,
}: ListMenuRowProps) {
  const palette = useThemePalette()
  const body = (
    <ListRowBody
      title={title}
      titleWeight={titleWeight}
      icon={icon}
      detail={detail}
      value={value}
      accessory={accessory}
      palette={palette}
    />
  )

  return (
    <NativeSelectMenu
      label={label ?? title}
      actions={actions}
      isAnchoredToRight={isAnchoredToRight}
      onSelect={(event) => onPressAction({ nativeEvent: { event } })}
    >
      {(open) => (
        <ListRowPressable
          accessibilityLabel={label ?? title}
          testID={testID}
          isLast={isLast}
          onPress={open}
          contentStyle={contentStyle}
          backgroundColor={backgroundColor}
        >
          {body}
        </ListRowPressable>
      )}
    </NativeSelectMenu>
  )
}

export function ListRow({
  title,
  titleWeight,
  label,
  icon,
  detail,
  value,
  accessory,
  onPress,
  isLast,
  testID,
  contentStyle,
  backgroundColor,
}: ListRowProps) {
  const palette = useThemePalette()
  const body = (
    <ListRowBody
      title={title}
      titleWeight={titleWeight}
      icon={icon}
      detail={detail}
      value={value}
      accessory={accessory}
      palette={palette}
    />
  )

  return (
    <ListRowPressable
      accessibilityLabel={label ?? title}
      onPress={onPress}
      isLast={isLast}
      testID={testID}
      contentStyle={contentStyle}
      backgroundColor={backgroundColor}
    >
      {body}
    </ListRowPressable>
  )
}

const styles = StyleSheet.create({
  pressableRow: {
    width: "100%",
  },
  iconSlot: {
    width: ROW_ICON_SIZE,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  centeredIconSlot: {
    alignSelf: "center",
  },
  brandIcon: {
    width: ROW_ICON_SIZE,
    height: ROW_ICON_SIZE,
    borderRadius: 5,
  },
  accessorySlot: {
    alignSelf: "center",
    flexShrink: 0,
  },
})
