import { Stack } from "expo-router";

import type { HeaderToolbarAction, HeaderToolbarProps } from "./header-toolbar.android";

function toolbarButtonElements(actions: HeaderToolbarAction[]) {
  return actions.map((action) => (
    <Stack.Toolbar.Button key={action.label} onPress={action.onPress}>
      {action.iosSfSymbol ? <Stack.Toolbar.Icon sf={action.iosSfSymbol} /> : null}
      {!action.iconOnly ? <Stack.Toolbar.Label>{action.label}</Stack.Toolbar.Label> : null}
    </Stack.Toolbar.Button>
  ));
}

export function HeaderToolbar({ left, right }: HeaderToolbarProps) {
  return (
    <>
      {left?.length ? (
        <Stack.Toolbar placement="left">{toolbarButtonElements(left)}</Stack.Toolbar>
      ) : null}
      {right?.length ? (
        <Stack.Toolbar placement="right">{toolbarButtonElements(right)}</Stack.Toolbar>
      ) : null}
    </>
  );
}

export type { HeaderToolbarAction, HeaderToolbarProps } from "./header-toolbar.android";
