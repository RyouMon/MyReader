import { type ReactNode } from "react";

import type { SFSymbol } from "expo-symbols";
import { Stack } from "expo-router";
import type { ColorValue } from "react-native";

import { View } from "@/tw";

import { RoundIconButton } from "./round-icon-button";

type HeaderToolbarAction = {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  /** SF Symbol name for iOS `Stack.Toolbar.Icon` (native toolbar does not accept arbitrary React children). */
  iosSfSymbol?: SFSymbol;
  /** Toolbar icon tint; on iOS maps to `Stack.Toolbar.Button` `tintColor`. */
  color?: ColorValue;
  iconOnly?: boolean;
};

type HeaderToolbarProps = {
  left?: HeaderToolbarAction[];
  right?: HeaderToolbarAction[];
};

function ActionGroup({ actions }: { actions: HeaderToolbarAction[] }) {
  return (
    <View className="flex-row items-center gap-2">
      {actions.map((action) => (
        <RoundIconButton key={action.label} label={action.label} onPress={action.onPress} icon={action.icon} />
      ))}
    </View>
  );
}

function renderActions(actions?: HeaderToolbarAction[]) {
  if (!actions?.length) {
    return null;
  }

  return actions.length === 1 ? (
    <RoundIconButton label={actions[0].label} onPress={actions[0].onPress} icon={actions[0].icon} />
  ) : (
    <ActionGroup actions={actions} />
  );
}

export function HeaderToolbar({ left, right }: HeaderToolbarProps) {
  return (
    <Stack.Screen
      options={{
        headerLeft: () => renderActions(left),
        headerRight: () => renderActions(right),
      }}
    />
  );
}

export type { HeaderToolbarAction, HeaderToolbarProps };
