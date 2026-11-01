import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Modal, View, useWindowDimensions } from "react-native"
import { Menu, PaperProvider } from "react-native-paper"
import type { SelectPopoverProps } from "./select-popover.types"

export function SelectPopover({
  visible,
  onDismiss,
  backgroundColor,
  trigger,
  children,
}: SelectPopoverProps) {
  const { t } = useTranslation()
  const root = useRef<View>(null)
  const [anchor, setAnchor] = useState<{
    x: number
    y: number
    width: number
  } | null>(null)
  const [presented, setPresented] = useState(false)
  const window = useWindowDimensions()
  useEffect(() => {
    if (visible) {
      root.current?.measureInWindow((x, y, width, height) =>
        setAnchor({ x, y: y + height, width }),
      )
    } else {
      setAnchor(null)
      setPresented(false)
    }
  }, [visible])
  return (
    <>
      <View ref={root} collapsable={false}>
        {trigger}
      </View>
      {visible && anchor ? (
        <Modal
          transparent
          visible
          animationType="none"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={onDismiss}
          onShow={() => setPresented(true)}
        >
          <PaperProvider>
            <Menu
              visible={presented}
              onDismiss={onDismiss}
              anchor={anchor}
              statusBarHeight={0}
              overlayAccessibilityLabel={t("common.close")}
              contentStyle={{ backgroundColor, borderRadius: 16 }}
            >
              {children(Math.min(anchor.width, window.width - 32))}
            </Menu>
          </PaperProvider>
        </Modal>
      ) : null}
    </>
  )
}
