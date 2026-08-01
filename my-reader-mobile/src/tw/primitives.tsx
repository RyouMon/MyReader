import { type LinkProps, Link as RouterLink } from "expo-router"
import React from "react"
import {
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableHighlight as RNTouchableHighlight,
  TouchableOpacity as RNTouchableOpacity,
  View as RNView,
  StyleSheet,
} from "react-native"
import { useNativeVariable as useFunctionalVariable } from "react-native-css"
import Animated from "react-native-reanimated"

import { cssElement } from "./css-element"

const styleMapping = {
  className: "style",
} as const

const RouterLinkForCss = RouterLink as React.ComponentType<
  LinkProps & { className?: string }
>

function CSSLink(props: LinkProps & { className?: string }) {
  return cssElement(RouterLinkForCss, props, styleMapping)
}

export const Link = Object.assign(CSSLink, {
  resolveHref: RouterLink.resolveHref,
  Menu: RouterLink.Menu,
  Trigger: RouterLink.Trigger,
  Preview: RouterLink.Preview,
  MenuAction: RouterLink.MenuAction,
}) as typeof RouterLink

export const useCSSVariable = useFunctionalVariable

export type ViewProps = React.ComponentProps<typeof RNView> & {
  className?: string
}

export const View = (props: ViewProps) => {
  return cssElement(RNView, props, styleMapping)
}
View.displayName = "CSS(View)"

export const Text = (
  props: React.ComponentProps<typeof RNText> & { className?: string },
) => {
  return cssElement(
    RNText,
    { maxFontSizeMultiplier: 1.3, ...props },
    styleMapping,
  )
}
Text.displayName = "CSS(Text)"

const scrollViewMapping = {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
} as const

type ScrollViewCssProps = React.ComponentProps<typeof RNScrollView> & {
  className?: string
  contentContainerClassName?: string
}

const RNScrollViewForCss =
  RNScrollView as React.ComponentType<ScrollViewCssProps>

export const ScrollView = React.forwardRef<RNScrollView, ScrollViewCssProps>(
  function ScrollView(props, ref) {
    return cssElement(RNScrollViewForCss, { ref, ...props }, scrollViewMapping)
  },
)
ScrollView.displayName = "CSS(ScrollView)"

export const Pressable = (
  props: React.ComponentProps<typeof RNPressable> & { className?: string },
) => {
  return cssElement(RNPressable, props, styleMapping)
}
Pressable.displayName = "CSS(Pressable)"

export const TextInput = (
  props: React.ComponentProps<typeof RNTextInput> & { className?: string },
) => {
  return cssElement(RNTextInput, props, styleMapping)
}
TextInput.displayName = "CSS(TextInput)"

const AnimatedScrollViewForCss = Animated.ScrollView as React.ComponentType<
  Record<string, unknown>
>

const animatedScrollViewMapping = {
  className: "style",
  contentClassName: "contentContainerStyle",
  contentContainerClassName: "contentContainerStyle",
} as const

type AnimatedScrollViewProps = React.ComponentProps<
  typeof Animated.ScrollView
> & {
  className?: string
  contentClassName?: string
  contentContainerClassName?: string
}

export const AnimatedScrollView = React.forwardRef<
  Animated.ScrollView,
  AnimatedScrollViewProps
>(function AnimatedScrollView(props, ref) {
  return cssElement(
    AnimatedScrollViewForCss,
    { ref, ...props },
    animatedScrollViewMapping,
  )
})

function XXTouchableHighlight(
  props: React.ComponentProps<typeof RNTouchableHighlight>,
) {
  const flat = StyleSheet.flatten(props.style) || {}
  const { underlayColor, ...style } = flat as typeof flat & {
    underlayColor?: string
  }
  return (
    <RNTouchableHighlight
      underlayColor={underlayColor}
      {...props}
      style={style}
    />
  )
}

export const TouchableHighlight = (
  props: React.ComponentProps<typeof RNTouchableHighlight> & {
    className?: string
  },
) => {
  return cssElement(XXTouchableHighlight, props, styleMapping)
}
TouchableHighlight.displayName = "CSS(TouchableHighlight)"

/** Maps `className` to `style` for TouchableOpacity. */
export const TouchableOpacity = (
  props: React.ComponentProps<typeof RNTouchableOpacity> & {
    className?: string
  },
) => {
  return cssElement(RNTouchableOpacity, props, styleMapping)
}
TouchableOpacity.displayName = "CSS(TouchableOpacity)"
