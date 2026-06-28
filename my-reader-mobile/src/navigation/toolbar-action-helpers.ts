import type { ScreenHeaderAction } from "./hooks/use-screen-header"

export type CreateAddActionParams = {
  label: string
  onPress: () => void
  color?: string
  disabled?: boolean
}

/** Builds a prominent "add" toolbar action with plus icon. */
export function createAddAction({
  label,
  onPress,
  color,
  disabled,
}: CreateAddActionParams): ScreenHeaderAction {
  return {
    label,
    onPress,
    iosSfSymbol: "plus",
    iconOnly: true,
    color,
    disabled,
    variant: "prominent",
  }
}

export type CreateSaveActionParams = {
  label: string
  onPress: () => void
  loading?: boolean
  color?: string
}

/** Builds a prominent "save" toolbar action with checkmark icon. */
export function createSaveAction({
  label,
  onPress,
  loading,
  color,
}: CreateSaveActionParams): ScreenHeaderAction {
  return {
    label,
    onPress,
    iosSfSymbol: "checkmark",
    iconOnly: true,
    loading,
    color,
    variant: "prominent",
  }
}
