import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { SymbolView } from "expo-symbols"
import {
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  View as RNView,
} from "react-native"

import { mixInk } from "@/src/design/color-mix"
import { useThemePalette } from "@/src/design/tokens"

import type { DeveloperConcurrencyControlProps } from "./developer-concurrency-control.types"

function StepperIcon({
  color,
  name,
}: {
  color: string
  name: "minus" | "plus"
}) {
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name={name}
        resizeMode="scaleAspectFit"
        size={15}
        tintColor={color}
      />
    )
  }

  return (
    <MaterialIcons
      name={name === "minus" ? "remove" : "add"}
      size={18}
      color={color}
    />
  )
}

export function DeveloperConcurrencyControl({
  value,
  min,
  max,
  decrementLabel,
  incrementLabel,
  onValueChange,
  testID,
}: DeveloperConcurrencyControlProps) {
  const palette = useThemePalette()
  const pressedButtonBackground = mixInk(
    palette.text,
    palette.backgroundSecondary,
    12,
  )
  const decrementDisabled = value <= min
  const incrementDisabled = value >= max

  function step(delta: number) {
    onValueChange(Math.min(max, Math.max(min, value + delta)))
  }

  function buttonStyle(disabled: boolean, pressed: boolean) {
    return [
      styles.button,
      {
        backgroundColor: pressed ? pressedButtonBackground : "transparent",
        opacity: disabled ? 0.44 : 1,
        transform: [{ scale: pressed && !disabled ? 0.94 : 1 }],
      },
    ]
  }

  return (
    <RNView
      testID={testID}
      style={[
        styles.root,
        {
          backgroundColor: palette.backgroundSecondary,
          borderColor: palette.borderStrong,
        },
      ]}
    >
      <Pressable
        accessibilityLabel={decrementLabel}
        accessibilityRole="button"
        disabled={decrementDisabled}
        hitSlop={8}
        android_ripple={{ color: pressedButtonBackground, borderless: false }}
        onPress={() => step(-1)}
        style={({ pressed }) => buttonStyle(decrementDisabled, pressed)}
        testID={`${testID}-decrement`}
      >
        <StepperIcon
          name="minus"
          color={decrementDisabled ? palette.textMuted : palette.text}
        />
      </Pressable>
      <RNView
        style={[
          styles.valueSlot,
          {
            borderColor: palette.borderStrong,
          },
        ]}
      >
        <RNText
          allowFontScaling={false}
          style={[styles.valueText, { color: palette.text }]}
          testID={`${testID}-value`}
        >
          {value}
        </RNText>
      </RNView>
      <Pressable
        accessibilityLabel={incrementLabel}
        accessibilityRole="button"
        disabled={incrementDisabled}
        hitSlop={8}
        android_ripple={{ color: pressedButtonBackground, borderless: false }}
        onPress={() => step(1)}
        style={({ pressed }) => buttonStyle(incrementDisabled, pressed)}
        testID={`${testID}-increment`}
      >
        <StepperIcon
          name="plus"
          color={incrementDisabled ? palette.textMuted : palette.text}
        />
      </Pressable>
    </RNView>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: 32,
    overflow: "hidden",
  },
  button: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  valueSlot: {
    alignItems: "center",
    alignSelf: "stretch",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minWidth: 32,
    paddingHorizontal: 8,
  },
  valueText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
  },
})
