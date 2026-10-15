import { useMemo, useRef, useState } from "react"
import { PanResponder, Pressable, Text, View } from "react-native"
import { useTranslation } from "react-i18next"
import { useThemePalette } from "@/src/design/tokens"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("")

export function AlphabetRail({ onJump }: { onJump: (letter: string) => void }) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const rail = useRef<View>(null)
  const jump = useRef(onJump)
  jump.current = onJump
  const dragging = useRef(false)
  const bounds = useRef<{ top: number; height: number } | null>(null)
  const [selection, setSelection] = useState<{
    letter: string
    centerY: number
  } | null>(null)
  const responder = useMemo(() => {
    let pageY = 0
    const select = (pageY: number) => {
      if (!bounds.current) return
      const { top, height } = bounds.current
      const index = Math.max(
        0,
        Math.min(
          ALPHABET.length - 1,
          Math.floor(((pageY - top) / height) * ALPHABET.length),
        ),
      )
      const letter = ALPHABET[index]!
      setSelection({
        letter,
        centerY: ((index + 0.5) * height) / ALPHABET.length,
      })
      jump.current(letter)
    }
    const measure = () => {
      if (!dragging.current) return
      rail.current?.measureInWindow((_x, top, _width, height) => {
        if (!dragging.current) return
        bounds.current = { top, height }
        select(pageY)
      })
    }
    const finish = () => {
      dragging.current = false
      bounds.current = null
      setSelection(null)
    }
    return {
      ...PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          dragging.current = true
          pageY = event.nativeEvent.pageY
          measure()
        },
        onPanResponderMove: (_, gesture) => {
          pageY = gesture.moveY
          select(pageY)
        },
        onPanResponderRelease: finish,
        onPanResponderTerminate: finish,
        onPanResponderTerminationRequest: () => false,
      }),
      // Collapsing the native large title can move the rail during a drag.
      onLayout: measure,
    }
  }, [])
  return (
    <View
      ref={rail}
      testID="catalog-alphabet-rail"
      accessibilityLabel={t("catalog.alphabetIndex")}
      {...responder.panHandlers}
      onLayout={responder.onLayout}
      style={{ width: 28, flexShrink: 1, justifyContent: "space-between" }}
    >
      {selection && (
        <View
          testID="catalog-alphabet-preview"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            right: 44,
            top: selection.centerY - 28,
            width: 56,
            height: 56,
            borderRadius: 16,
            borderCurve: "continuous",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.primary,
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontWeight: "600",
              color: palette.textOnPrimary,
            }}
          >
            {selection.letter}
          </Text>
        </View>
      )}
      {ALPHABET.map((letter) => (
        <Pressable
          key={letter}
          accessibilityRole="button"
          accessibilityLabel={t("catalog.jumpTo", { letter })}
          onPress={() => onJump(letter)}
        >
          <Text
            style={{
              textAlign: "center",
              fontSize: 11,
              lineHeight: 16,
              color: palette.primary,
            }}
          >
            {letter}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
