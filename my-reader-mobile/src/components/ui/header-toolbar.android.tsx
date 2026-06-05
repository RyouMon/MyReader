import { type ReactNode } from "react";

import {
  CircularProgressIndicator,
  Host,
  Icon,
  IconButton,
} from "@expo/ui/jetpack-compose";
import { size } from "@expo/ui/jetpack-compose/modifiers";
import { Stack, type NativeStackNavigationOptions } from "expo-router";
import type { SFSymbol } from "expo-symbols";
import { Pressable, type ColorValue } from "react-native";

import { useTheme } from "@/src/design/tokens";
import { View } from "@/tw";

import { resolveToolbarMaterialIcon } from "./header-toolbar-material-icons.android";
import { RoundIconButton } from "./round-icon-button";
import { buildAndroidHeaderToolbarNavigationOptions } from "./header-toolbar-navigation-options.android";

type HeaderToolbarAction = {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  /** SF Symbol name for iOS `Stack.Toolbar.Icon` (native toolbar does not accept arbitrary React children). */
  iosSfSymbol?: SFSymbol;
  /** Toolbar icon tint; on iOS maps to `Stack.Toolbar.Button` `tintColor`. */
  color?: ColorValue;
  iconOnly?: boolean;
  loading?: boolean;
  disabled?: boolean;
  variant?: "done" | "prominent" | "plain";
};

type HeaderToolbarProps = {
  left?: HeaderToolbarAction[];
  right?: HeaderToolbarAction[];
};

function HeaderToolbarActionButton({ action }: { action: HeaderToolbarAction }) {
  const { palette, colorScheme } = useTheme();
  const materialIcon = resolveToolbarMaterialIcon(action.iosSfSymbol);
  const enabled = !(action.loading || action.disabled);
  const isDark = colorScheme === "dark";

  if (!materialIcon) {
    return (
      <RoundIconButton
        label={action.label}
        onPress={action.onPress}
        icon={action.icon}
        disabled={!enabled}
      />
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: !enabled }}
      android_ripple={{
        color: isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.12)",
        borderless: true,
        radius: 24,
      }}
      disabled={!enabled}
      onPress={action.onPress}
    >
      <Host matchContents pointerEvents="none" style={{ overflow: "visible" }}>
        <IconButton
          colors={{
            contentColor: palette.text,
            disabledContentColor: palette.textMuted,
          }}
          enabled={enabled}
        >
          {action.loading ? (
            <CircularProgressIndicator
              color={palette.text}
              modifiers={[size(20, 20)]}
              strokeWidth={2}
            />
          ) : (
            <Icon
              source={materialIcon}
              size={24}
              contentDescription={action.label}
            />
          )}
        </IconButton>
      </Host>
    </Pressable>
  );
}

function ActionGroup({ actions }: { actions: HeaderToolbarAction[] }) {
  return (
    <View className="flex-row items-center">
      {actions.map((action) => (
        <HeaderToolbarActionButton key={action.label} action={action} />
      ))}
    </View>
  );
}

function renderActions(actions?: HeaderToolbarAction[]) {
  if (!actions?.length) {
    return null;
  }

  const first = actions[0];
  if (!first) return null;

  return actions.length === 1 ? (
    <HeaderToolbarActionButton action={first} />
  ) : (
    <ActionGroup actions={actions} />
  );
}

/** Builds native-stack header overrides for Android toolbar actions (testable). */
export { buildAndroidHeaderToolbarNavigationOptions } from "./header-toolbar-navigation-options.android";

export function HeaderToolbar({ left, right }: HeaderToolbarProps) {
  const options = buildAndroidHeaderToolbarNavigationOptions({
    hasLeft: Boolean(left?.length),
    hasRight: Boolean(right?.length),
    renderLeft: () => renderActions(left),
    renderRight: () => renderActions(right),
  });

  if (!left?.length && !right?.length) {
    return null;
  }

  return <Stack.Screen options={options} />;
}

export type { HeaderToolbarAction, HeaderToolbarProps };
