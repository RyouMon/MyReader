import { StyleSheet, View, type ViewProps } from "react-native"

type SkeletonProps = ViewProps

/**
 * React Native Reusables-style loading placeholder.
 *
 * The upstream template uses an animated opacity pulse. MyReader's library grid
 * uses this static variant in recycled cells so pending covers do not add
 * per-cell animation work while the user is scrolling.
 */
export function Skeleton({ style, ...props }: SkeletonProps) {
  return <View {...props} style={[styles.root, style]} />
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "rgba(122, 107, 93, 0.18)",
    borderRadius: 6,
  },
})
