import { type ReactNode } from "react";

import { Stack, type NativeStackNavigationOptions } from "expo-router";
import type { SFSymbol } from "expo-symbols";
import type { ColorValue } from "react-native";

import { View } from "@/tw";

import { AndroidHeaderIconButton } from "./android-header-icon-button";
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
  const materialIcon = resolveToolbarMaterialIcon(action.iosSfSymbol);
  const enabled = !(action.loading || action.disabled);

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
    <AndroidHeaderIconButton
      icon={materialIcon}
      accessibilityLabel={action.label}
      disabled={!enabled}
      loading={action.loading}
      onPress={action.onPress}
    />
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
