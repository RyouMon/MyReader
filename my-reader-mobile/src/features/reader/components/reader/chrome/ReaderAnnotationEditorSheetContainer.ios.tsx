import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui"
import {
  interactiveDismissDisabled,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
  type ModifierConfig,
  type PresentationDetent,
} from "@expo/ui/swift-ui/modifiers"
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { StyleSheet, useWindowDimensions, View as RNView } from "react-native"

import type {
  ReaderAnnotationEditorSheetContainerProps,
  ReaderAnnotationEditorSheetRef,
} from "./ReaderAnnotationEditorSheetContainer.types"

const SHEET_DETENT: PresentationDetent = { fraction: 0.88 }

const ReaderAnnotationEditorSheetContainer = forwardRef<
  ReaderAnnotationEditorSheetRef,
  ReaderAnnotationEditorSheetContainerProps
>(function ReaderAnnotationEditorSheetContainer(
  { backgroundColor, children, pending, onDismiss },
  ref,
) {
  const { width } = useWindowDimensions()
  const [presented, setPresented] = useState(false)
  const presentedRef = useRef(false)
  const modifiers = useMemo<ModifierConfig[]>(
    () => [
      presentationDetents([SHEET_DETENT]),
      presentationDragIndicator("visible"),
      presentationBackground(backgroundColor),
      interactiveDismissDisabled(pending),
    ],
    [backgroundColor, pending],
  )

  const finishDismiss = useCallback(() => {
    if (!presentedRef.current) return
    presentedRef.current = false
    setPresented(false)
    onDismiss()
  }, [onDismiss])

  const dismiss = useCallback(() => {
    if (!presentedRef.current) return
    setPresented(false)
    finishDismiss()
  }, [finishDismiss])

  useImperativeHandle(
    ref,
    () => ({
      present: () => {
        presentedRef.current = true
        setPresented(true)
      },
      dismiss,
    }),
    [dismiss],
  )

  return (
    <Host
      style={[styles.host, { width }]}
      pointerEvents="none"
      ignoreSafeArea="all"
    >
      <BottomSheet
        isPresented={presented}
        onIsPresentedChange={(isPresented) => {
          if (!isPresented) setPresented(false)
        }}
        onDismiss={finishDismiss}
      >
        <Group modifiers={modifiers}>
          <RNHostView>
            <RNView style={styles.content}>{children}</RNView>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  )
})

export default ReaderAnnotationEditorSheetContainer

const styles = StyleSheet.create({
  host: {
    position: "absolute",
  },
  content: {
    flexGrow: 1,
    height: 0,
    paddingTop: 16,
  },
})
