import type { Locator } from "./locator"

export interface SelectionAction {
  id: string
  label: string
}

export interface SelectionEvent {
  locator?: Locator
  selectedText?: string
}

export interface SelectionActionEvent {
  locator: Locator
  selectedText: string
  actionId: string
}
