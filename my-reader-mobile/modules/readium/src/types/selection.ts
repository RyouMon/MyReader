import type { Locator } from "./locator"
import type { Rect } from "./events"

export interface SelectionAction {
  id: string
  label: string
}

export interface SelectionMenuColor {
  id: string
  label: string
  color: string
  selected?: boolean
}

export interface SelectionMenuAction {
  id: string
  label: string
  destructive?: boolean
}

export interface SelectionMenuConfig {
  locator: Locator
  selectedText: string
  rect?: Rect
  colorMenuLabel: string
  colors: SelectionMenuColor[]
  actions: SelectionMenuAction[]
}

export interface SelectionEvent {
  locator?: Locator
  selectedText?: string
  rect?: Rect
}

export interface SelectionActionEvent {
  locator: Locator
  selectedText: string
  actionId: string
}
