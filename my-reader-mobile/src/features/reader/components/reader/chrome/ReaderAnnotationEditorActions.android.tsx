import { StyleSheet } from "react-native"

import { underlayFromSurface } from "@/src/design/reader-chrome-palette"
import { Pressable, View } from "@/tw"
import { ReaderChromeIcon } from "./ReaderChromeIcon"
import type { ReaderAnnotationEditorActionsProps } from "./ReaderAnnotationEditorActions.types"

export default function ReaderAnnotationEditorActions({
  deleteColor,
  deleteLabel,
  deleteSurfaceColor,
  pending,
  saveColor,
  saveContentColor,
  saveDisabled,
  saveLabel,
  showDelete,
  onDelete,
  onSave,
}: ReaderAnnotationEditorActionsProps) {
  return (
    <View style={styles.actions}>
      {showDelete ? (
        <View style={styles.actionButtonClip}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={deleteLabel}
            accessibilityState={{ disabled: pending }}
            android_ripple={{
              borderless: false,
              color: underlayFromSurface(deleteColor, deleteSurfaceColor),
              foreground: true,
              radius: 26,
            }}
            disabled={pending}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: deleteSurfaceColor },
              pressed && !pending ? styles.actionButtonPressed : null,
              pending ? styles.actionButtonDisabled : null,
            ]}
            onPress={onDelete}
          >
            <ReaderChromeIcon name="delete" size={28} color={deleteColor} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.actionButtonClip, styles.saveActionButtonClip]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saveLabel}
          accessibilityState={{ disabled: pending || saveDisabled }}
          android_ripple={{
            borderless: false,
            color: underlayFromSurface(saveContentColor, saveColor),
            foreground: true,
            radius: 26,
          }}
          disabled={pending || saveDisabled}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: saveColor },
            pressed && !pending ? styles.actionButtonPressed : null,
            pending || saveDisabled ? styles.actionButtonDisabled : null,
          ]}
          onPress={onSave}
        >
          <ReaderChromeIcon name="check" size={28} color={saveContentColor} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  actions: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: 84,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  actionButtonClip: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonPressed: {
    opacity: 0.72,
  },
  actionButtonDisabled: {
    opacity: 0.38,
  },
  saveActionButtonClip: {
    marginLeft: "auto",
  },
})
