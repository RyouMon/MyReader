import type { ViewProps } from "react-native"

import type {
  DecorationActivatedEvent,
  DecorationGroup,
  FontFamilyDeclaration,
  Locator,
  Preferences,
  PublicationReadyEvent,
  ReadiumFile,
  SelectionAction,
  SelectionActionEvent,
  SelectionEvent,
  SelectionMenuConfig,
  TapEvent,
  TtsEngineConfig,
  TtsPlaybackState,
  TtsSynthesisCancelEvent,
  TtsSynthesisCompletion,
  TtsSynthesisRequestEvent,
} from "./types"

/** Imperative navigation and reading controls. */
export type ReadiumViewRef = {
  goTo: (locator: Locator, preferences?: Preferences) => void
  goForward: () => void
  goBackward: () => void
  clearSelection: () => void
  getBookmarkLocator: () => Promise<Locator | null>
  isBookmarkVisible: (locator: Locator) => Promise<boolean>
  reattachTtsViewport: (
    sessionId: string,
    viewportNavigationId: string,
  ) => Promise<boolean>
  returnToTtsPosition: (
    sessionId: string,
    viewportNavigationId: string,
  ) => Promise<boolean>
  startTts: (
    config: TtsEngineConfig,
    fromLocator: Locator | undefined,
    options: {
      sessionId: string
      startAtViewportStart?: boolean
      viewportDetached?: boolean
      viewportNavigationId?: string
    },
  ) => Promise<void>
  playTts: () => void
  pauseTts: () => void
  stopTts: () => void
  previousTts: () => void
  nextTts: () => void
  completeTtsSynthesis: (completion: TtsSynthesisCompletion) => void
}

/** Public props contract — kept identical to the fork for drop-in migration. */
export type ReadiumProps = {
  file: ReadiumFile
  preferences: Preferences
  fontFamilyDeclarations?: FontFamilyDeclaration[]
  decorations?: DecorationGroup[]
  selectionActions?: SelectionAction[]
  selectionMenu?: SelectionMenuConfig
  customSelectionMenu?: boolean
  style?: ViewProps["style"]
  onLocationChange?: (
    locator: Locator,
    source?: "tts" | "user",
    navigationId?: string,
    navigationKind?: "pageTurn" | "programmatic",
  ) => void
  onPublicationReady?: (event: PublicationReadyEvent) => void
  onDecorationActivated?: (event: DecorationActivatedEvent) => void
  onSelectionChange?: (event: SelectionEvent) => void
  onSelectionAction?: (event: SelectionActionEvent) => void
  onTap?: (event: TapEvent) => void
  onTtsStateChange?: (event: TtsPlaybackState) => void
  onTtsSynthesisRequest?: (event: TtsSynthesisRequestEvent) => void
  onTtsSynthesisCancel?: (event: TtsSynthesisCancelEvent) => void
}
