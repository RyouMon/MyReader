import { BottomSheetModal } from "@expo/ui/community/bottom-sheet"
import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui"
import {
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
import { Platform, StyleSheet, View as RNView } from "react-native"

import type {
  ReaderSettingsSheetContainerProps,
  ReaderSettingsSheetRef,
} from "./ReaderSettingsSheetContainer.types"

const PHONE_DETENT: PresentationDetent = { fraction: 0.5 }
const IPAD_SNAP_POINTS: (string | number)[] = ["100%"]
const IS_IPAD = Platform.OS === "ios" && Platform.isPad

const ReaderSettingsSheetContainer = forwardRef<
  ReaderSettingsSheetRef,
  ReaderSettingsSheetContainerProps
>(function ReaderSettingsSheetContainer(
  { backgroundColor, children, onDismiss },
  ref,
) {
  const [presented, setPresented] = useState(false)
  const presentedRef = useRef(false)
  const ipadSheetRef = useRef<BottomSheetModal>(null)
  const modifiers = useMemo<ModifierConfig[]>(
    () => [
      presentationDetents([PHONE_DETENT]),
      presentationDragIndicator("visible"),
      presentationBackground(backgroundColor),
    ],
    [backgroundColor],
  )

  const finishPhoneDismiss = useCallback(() => {
    if (!presentedRef.current) return
    presentedRef.current = false
    setPresented(false)
    onDismiss()
  }, [onDismiss])
  const dismiss = useCallback(() => {
    if (IS_IPAD) {
      ipadSheetRef.current?.dismiss()
      return
    }
    finishPhoneDismiss()
  }, [finishPhoneDismiss])

  useImperativeHandle(
    ref,
    () => ({
      present: () => {
        if (IS_IPAD) {
          ipadSheetRef.current?.present()
          return
        }
        presentedRef.current = true
        setPresented(true)
      },
      dismiss,
    }),
    [dismiss],
  )

  if (IS_IPAD) {
    return (
      <BottomSheetModal
        ref={ipadSheetRef}
        index={0}
        snapPoints={IPAD_SNAP_POINTS}
        enableDynamicSizing={false}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor }}
        onDismiss={onDismiss}
      >
        <RNView style={styles.ipadContent}>{children}</RNView>
      </BottomSheetModal>
    )
  }

  return (
    <Host style={styles.host} pointerEvents="none">
      <BottomSheet
        isPresented={presented}
        onIsPresentedChange={(isPresented) => {
          if (!isPresented) finishPhoneDismiss()
        }}
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

export default ReaderSettingsSheetContainer

const styles = StyleSheet.create({
  ipadContent: {
    flex: 1,
  },
  host: {
    position: "absolute",
  },
  content: {
    flexGrow: 1,
    height: 0,
    paddingTop: 16,
  },
})
