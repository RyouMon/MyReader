import type { ReactNode } from "react"

export type ReaderAnnotationEditorSheetRef = {
  present: () => void
  dismiss: () => void
}

export type ReaderAnnotationEditorSheetContainerProps = {
  backgroundColor: string
  children: ReactNode
  pending: boolean
  onDismiss: () => void
}
