import { BottomSheetModal } from "@expo/ui/community/bottom-sheet"
import { forwardRef, useImperativeHandle, useRef } from "react"
import { StyleSheet, View as RNView } from "react-native"

import type {
  ReaderSettingsSheetContainerProps,
  ReaderSettingsSheetRef,
} from "./ReaderSettingsSheetContainer.types"

const READER_SETTINGS_SHEET_SNAP_POINTS: (string | number)[] = ["50%"]
const EXPANDED_READER_SETTINGS_SHEET_SNAP_POINTS: (string | number)[] = ["100%"]

const ReaderSettingsSheetContainer = forwardRef<
  ReaderSettingsSheetRef,
  ReaderSettingsSheetContainerProps
>(function ReaderSettingsSheetContainer(
  { backgroundColor, children, expanded = false, onDismiss },
  ref,
) {
  const sheetRef = useRef<BottomSheetModal>(null)

  useImperativeHandle(
    ref,
    () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }),
    [],
  )

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={
        expanded
          ? EXPANDED_READER_SETTINGS_SHEET_SNAP_POINTS
          : READER_SETTINGS_SHEET_SNAP_POINTS
      }
      enableDynamicSizing={false}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor }}
      onDismiss={onDismiss}
    >
      <RNView style={styles.content}>{children}</RNView>
    </BottomSheetModal>
  )
})

export default ReaderSettingsSheetContainer

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
})
