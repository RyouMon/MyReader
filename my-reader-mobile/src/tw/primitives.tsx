import { Link as RouterLink, type LinkProps } from "expo-router";
import {
  useCssElement,
  useNativeVariable as useFunctionalVariable,
} from "react-native-css";
import React from "react";
import {
  View as RNView,
  Text as RNText,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  TouchableHighlight as RNTouchableHighlight,
  TextInput as RNTextInput,
  StyleSheet,
} from "react-native";
import Animated from "react-native-reanimated";

export const Link = Object.assign(
  (props: LinkProps & { className?: string }) => {
    return useCssElement(RouterLink, props, { className: "style" });
  },
  {
    resolveHref: RouterLink.resolveHref,
    Menu: RouterLink.Menu,
    Trigger: RouterLink.Trigger,
    Preview: RouterLink.Preview,
    MenuAction: RouterLink.MenuAction,
  }
) as typeof RouterLink;

export const useCSSVariable =
  process.env.EXPO_OS !== "web"
    ? useFunctionalVariable
    : (variable: string) => `var(${variable})`;

export type ViewProps = React.ComponentProps<typeof RNView> & {
  className?: string;
};

export const View = (props: ViewProps) => {
  return useCssElement(RNView, props, { className: "style" });
};
View.displayName = "CSS(View)";

export const Text = (
  props: React.ComponentProps<typeof RNText> & { className?: string }
) => {
  return useCssElement(RNText, props, { className: "style" });
};
Text.displayName = "CSS(Text)";

export const ScrollView = (
  props: React.ComponentProps<typeof RNScrollView> & {
    className?: string;
    contentContainerClassName?: string;
  }
) => {
  return useCssElement(RNScrollView, props, {
    className: "style",
    contentContainerClassName: "contentContainerStyle",
  });
};
ScrollView.displayName = "CSS(ScrollView)";

export const Pressable = (
  props: React.ComponentProps<typeof RNPressable> & { className?: string }
) => {
  return useCssElement(RNPressable, props, { className: "style" });
};
Pressable.displayName = "CSS(Pressable)";

export const TextInput = (
  props: React.ComponentProps<typeof RNTextInput> & { className?: string }
) => {
  return useCssElement(RNTextInput, props, { className: "style" });
};
TextInput.displayName = "CSS(TextInput)";

type AnimatedScrollViewProps = React.ComponentProps<
  typeof Animated.ScrollView
> & {
  className?: string;
  contentClassName?: string;
  contentContainerClassName?: string;
};

export function AnimatedScrollView(props: AnimatedScrollViewProps) {
  return useCssElement(
    Animated.ScrollView as React.ComponentType<Record<string, unknown>>,
    props,
    {
      className: "style",
      contentClassName: "contentContainerStyle",
      contentContainerClassName: "contentContainerStyle",
    }
  );
}

function XXTouchableHighlight(
  props: React.ComponentProps<typeof RNTouchableHighlight>
) {
  const flat = StyleSheet.flatten(props.style) || {};
  const { underlayColor, ...style } = flat as typeof flat & {
    underlayColor?: string;
  };
  return (
    <RNTouchableHighlight
      underlayColor={underlayColor}
      {...props}
      style={style}
    />
  );
}

export const TouchableHighlight = (
  props: React.ComponentProps<typeof RNTouchableHighlight> & {
    className?: string;
  }
) => {
  return useCssElement(XXTouchableHighlight, props, { className: "style" });
};
TouchableHighlight.displayName = "CSS(TouchableHighlight)";
