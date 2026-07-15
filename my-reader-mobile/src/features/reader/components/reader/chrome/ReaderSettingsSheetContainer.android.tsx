import {
  Column,
  Host,
  ModalBottomSheet,
  RNHostView,
  type ModalBottomSheetRef,
} from "@expo/ui/jetpack-compose"
import { height as heightModifier } from "@expo/ui/jetpack-compose/modifiers"
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
  ReaderSettingsSheetContainerProps,
  ReaderSettingsSheetRef,
} from "./ReaderSettingsSheetContainer.types"

const READER_SETTINGS_SHEET_HEIGHT_RATIO = 0.5

const ReaderSettingsSheetContainer = forwardRef<
  ReaderSettingsSheetRef,
  ReaderSettingsSheetContainerProps
>(function ReaderSettingsSheetContainer(
  { backgroundColor, children, onDismiss },
  ref,
) {
  const { height: windowHeight } = useWindowDimensions()
  const [presented, setPresented] = useState(false)
  const presentedRef = useRef(false)
  const sheetRef = useRef<ModalBottomSheetRef>(null)
  const heightModifiers = useMemo(
    () => [heightModifier(windowHeight * READER_SETTINGS_SHEET_HEIGHT_RATIO)],
    [windowHeight],
  )

  const finishDismiss = useCallback(() => {
    if (!presentedRef.current) return
    presentedRef.current = false
    setPresented(false)
    onDismiss()
  }, [onDismiss])
  const dismiss = useCallback(() => {
    if (!presentedRef.current) return
    const pendingDismiss = sheetRef.current?.hide()
    if (pendingDismiss) {
      void pendingDismiss.then(finishDismiss, finishDismiss)
      return
    }
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

  if (!presented) return null

  return (
    <Host style={StyleSheet.absoluteFill}>
      <ModalBottomSheet
        ref={sheetRef}
        containerColor={backgroundColor}
        initialFullyExpanded={false}
        onDismissRequest={finishDismiss}
        properties={{
          shouldDismissOnBackPress: true,
          shouldDismissOnClickOutside: true,
        }}
        sheetGesturesEnabled
        showDragHandle
        skipPartiallyExpanded
      >
        <Column modifiers={heightModifiers}>
          <RNHostView>
            <RNView style={styles.content}>{children}</RNView>
          </RNHostView>
        </Column>
      </ModalBottomSheet>
    </Host>
  )
})

export default ReaderSettingsSheetContainer

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    height: 0,
  },
})
