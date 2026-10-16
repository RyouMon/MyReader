import { useCallback, useEffect, useState } from "react"
import { BackHandler, Keyboard } from "react-native"
import { useIsFocused } from "expo-router"
import { useTranslation } from "react-i18next"
import type { ScreenHeaderAction } from "@/src/navigation/hooks/use-screen-header"

export function useCatalogSearchPresentation(
  scope: string | null | undefined,
  initialOpen = false,
  onOpen?: () => void,
  onClose?: () => void,
) {
  const { t } = useTranslation()
  const focused = useIsFocused()
  const [isOpen, setIsOpen] = useState(initialOpen)
  useEffect(() => setIsOpen(initialOpen), [scope, initialOpen])
  const close = useCallback(() => {
    Keyboard.dismiss()
    setIsOpen(false)
    onClose?.()
  }, [onClose])
  useEffect(() => {
    if (!isOpen || !focused) return
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        close()
        return true
      },
    )
    return () => subscription.remove()
  }, [isOpen, focused, close])
  const action: ScreenHeaderAction = {
    label: t(isOpen ? "common.close" : "common.search"),
    iosSfSymbol: isOpen ? "xmark" : "magnifyingglass",
    iconOnly: true,
    onPress: () => {
      if (isOpen) close()
      else {
        setIsOpen(true)
        onOpen?.()
      }
    },
  }
  return { isOpen, action }
}
