import { Button, HStack, Host, Spacer } from "@expo/ui/swift-ui"
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled,
  labelStyle,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers"
import { StyleSheet } from "react-native"

import type { ReaderAnnotationEditorActionsProps } from "./ReaderAnnotationEditorActions.types"

export default function ReaderAnnotationEditorActions({
  deleteColor,
  deleteLabel,
  pending,
  saveColor,
  saveDisabled,
  saveLabel,
  showDelete,
  onDelete,
  onSave,
}: ReaderAnnotationEditorActionsProps) {
  return (
    <Host style={styles.host}>
      <HStack
        alignment="center"
        modifiers={[padding({ horizontal: 20, vertical: 6 })]}
      >
        {showDelete ? (
          <Button
            label={deleteLabel}
            systemImage="trash"
            role="destructive"
            modifiers={[
              buttonStyle("bordered"),
              buttonBorderShape("circle"),
              controlSize("large"),
              labelStyle("iconOnly"),
              tint(deleteColor),
              disabled(pending),
            ]}
            onPress={onDelete}
          />
        ) : null}
        <Spacer />
        <Button
          label={saveLabel}
          systemImage="checkmark"
          modifiers={[
            buttonStyle("borderedProminent"),
            buttonBorderShape("circle"),
            controlSize("large"),
            labelStyle("iconOnly"),
            tint(saveColor),
            disabled(pending || saveDisabled),
          ]}
          onPress={onSave}
        />
      </HStack>
    </Host>
  )
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: 56,
  },
})
