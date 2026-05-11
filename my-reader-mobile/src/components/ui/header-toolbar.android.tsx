import { type ReactNode } from "react";

import { Stack } from "expo-router";
import type { SFSymbol } from "expo-symbols";
import { ActivityIndicator, type ColorValue } from "react-native";

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
  loading?: boolean;
  disabled?: boolean;
  variant?: "done" | "prominent" | "plain";
};

type HeaderToolbarProps = {
  left?: HeaderToolbarAction[];
  right?: HeaderToolbarAction[];
};

function ActionGroup({ actions }: { actions: HeaderToolbarAction[] }) {
  return (
    <View className="flex-row items-center gap-2">
      {actions.map((action) => (
        <RoundIconButton
          key={action.label}
          label={action.label}
          onPress={action.onPress}
          icon={
            action.loading ? (
              <ActivityIndicator color={String(action.color ?? "#000")} size="small" />
            ) : (
              action.icon
            )
          }
          disabled={action.loading || action.disabled}
        />
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
    <RoundIconButton
      label={first.label}
      onPress={first.onPress}
      icon={
        first.loading ? (
          <ActivityIndicator color={String(first.color ?? "#000")} size="small" />
        ) : (
          first.icon
        )
      }
      disabled={first.disabled}
    />
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
