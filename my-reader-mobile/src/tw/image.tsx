import { Image as RNImage } from "expo-image"
import type React from "react"
import { type ImageStyle, StyleSheet } from "react-native"
import Animated from "react-native-reanimated"

import { cssElement } from "./css-element"

const AnimatedExpoImage = Animated.createAnimatedComponent(RNImage)

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

const imageMapping = {
  className: "style",
} as const

type CSSImageProps = React.ComponentProps<typeof CSSImage> & {
  className?: string
}

export const Image = (props: CSSImageProps) => {
  return cssElement(CSSImage, props, imageMapping)
}

Image.displayName = "CSS(Image)"

export type ImageProps = React.ComponentProps<typeof Image>
