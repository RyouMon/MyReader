import type { ReactNode } from "react"

export type ReaderSettingsSheetRef = {
  present: () => void
  dismiss: () => void
}

export type ReaderSettingsSheetContainerProps = {
  backgroundColor: string
  children: ReactNode
  onDismiss: () => void
}
