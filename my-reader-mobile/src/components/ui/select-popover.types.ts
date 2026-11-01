import type { ReactNode } from "react"

export type SelectPopoverProps = {
  visible: boolean
  onDismiss: () => void
  backgroundColor: string
  trigger: ReactNode
  children: (width: number) => ReactNode
}
