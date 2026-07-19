import {
  Column,
  Host,
  ModalBottomSheet,
  RNHostView,
  type ModalBottomSheetRef,
} from "@expo/ui/jetpack-compose"
import { fillMaxSize } from "@expo/ui/jetpack-compose/modifiers"
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { StyleSheet, View as RNView } from "react-native"

import type {
  ReaderAnnotationEditorSheetContainerProps,
  ReaderAnnotationEditorSheetRef,
} from "./ReaderAnnotationEditorSheetContainer.types"

const ReaderAnnotationEditorSheetContainer = forwardRef<
  ReaderAnnotationEditorSheetRef,
  ReaderAnnotationEditorSheetContainerProps
>(function ReaderAnnotationEditorSheetContainer(
  { backgroundColor, children, pending, onDismiss },
  ref,
) {
  const [presented, setPresented] = useState(false)
  const presentedRef = useRef(false)
  const sheetRef = useRef<ModalBottomSheetRef>(null)

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
        initialFullyExpanded
        onDismissRequest={finishDismiss}
        properties={{
          shouldDismissOnBackPress: !pending,
          shouldDismissOnClickOutside: !pending,
        }}
        sheetGesturesEnabled={!pending}
        showDragHandle
        skipPartiallyExpanded
      >
        <Column modifiers={[fillMaxSize()]}>
          <RNHostView>
            <RNView style={styles.content}>{children}</RNView>
          </RNHostView>
        </Column>
      </ModalBottomSheet>
    </Host>
  )
})

export default ReaderAnnotationEditorSheetContainer

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    height: 0,
    paddingTop: 16,
  },
})
