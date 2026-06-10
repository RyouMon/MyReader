import { type ReactNode } from "react";

import type { SFSymbol } from "expo-symbols";
import type { ColorValue } from "react-native";

import { View } from "@/tw";

import { AndroidHeaderIconButton } from "./android-header-icon-button";
import { resolveToolbarMaterialIcon } from "./header-toolbar-material-icons.android";
import { RoundIconButton } from "./round-icon-button";

export type HeaderToolbarAction = {
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

export type HeaderToolbarProps = {
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

/** Renders a set of toolbar actions as Android header button nodes. */
export function renderHeaderToolbarActions(actions?: HeaderToolbarAction[]): ReactNode {
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

/** @deprecated On Android, toolbar actions should be set via `useScreenHeader` hook which injects them into `Stack.Screen` options. This component returns null on Android. */
export function HeaderToolbar(_props: HeaderToolbarProps) {
  return null;
}

export { buildAndroidHeaderToolbarNavigationOptions } from "./header-toolbar-navigation-options.android";
