import { Image as RNImage } from "expo-image"
import { useCssElement } from "react-native-css"
import React from "react"
import { type ImageStyle, StyleSheet } from "react-native"
import Animated from "react-native-reanimated"

const AnimatedExpoImage = Animated.createAnimatedComponent(RNImage)

/* eslint-disable @typescript-eslint/no-explicit-any */
const cssElement = useCssElement as unknown as (
  Component: React.ComponentType<any>,
  props: any,
  mapping: any,
) => any
/* eslint-enable @typescript-eslint/no-explicit-any */

type FlatStyle = ImageStyle & {
  objectFit?: React.ComponentProps<typeof AnimatedExpoImage>["contentFit"]
  objectPosition?: React.ComponentProps<
    typeof AnimatedExpoImage
  >["contentPosition"]
}

function CSSImage(props: React.ComponentProps<typeof AnimatedExpoImage>) {
  const { objectFit, objectPosition, ...style } = (StyleSheet.flatten(
    props.style,
  ) || {}) as FlatStyle

  return (
    <AnimatedExpoImage
      {...props}
      contentFit={objectFit}
      contentPosition={objectPosition}
      source={
        typeof props.source === "string" ? { uri: props.source } : props.source
      }
      style={style}
    />
  )
}

export const Image = (
  props: React.ComponentProps<typeof CSSImage> & { className?: string },
) => {
  return cssElement(CSSImage, props, { className: "style" })
}

Image.displayName = "CSS(Image)"

export type ImageProps = React.ComponentProps<typeof Image>
