import { requireNativeView } from "expo"
import type React from "react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { findNodeHandle, StyleSheet, View } from "react-native"
import type { LayoutChangeEvent, ViewProps } from "react-native"
import { ReadiumModule } from "./ReadiumModule"
import type { ReadiumProps, ReadiumViewRef } from "./ReadiumView.types"
import type {
  DecorationActivatedEvent,
  DecorationGroup,
  Dimensions,
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
import { buildLinkTree } from "./utils/buildLinkTree"

/** Props the native Expo View accepts (props + onXxx event handlers). */
type NativeReadiumViewProps = {
  file: ReadiumFile
  preferences?: Preferences
  fontFamilyDeclarations?: FontFamilyDeclaration[]
  decorations?: DecorationGroup[]
  selectionActions?: SelectionAction[]
  selectionMenu?: SelectionMenuConfig
  customSelectionMenu?: boolean
  style?: ViewProps["style"]
  onLocationChange?: (e: {
    nativeEvent: {
      locator: Locator
      source?: "tts" | "user"
      navigationId?: string
      navigationKind?: "pageTurn" | "programmatic"
    }
  }) => void
  onPublicationReady?: (e: { nativeEvent: PublicationReadyEvent }) => void
  onDecorationActivated?: (e: { nativeEvent: DecorationActivatedEvent }) => void
  onSelectionChange?: (e: { nativeEvent: SelectionEvent }) => void
  onSelectionAction?: (e: { nativeEvent: SelectionActionEvent }) => void
  onTap?: (e: { nativeEvent: TapEvent }) => void
  onTtsStateChange?: (e: { nativeEvent: TtsPlaybackState }) => void
  onTtsSynthesisRequest?: (e: { nativeEvent: TtsSynthesisRequestEvent }) => void
  onTtsSynthesisCancel?: (e: { nativeEvent: TtsSynthesisCancelEvent }) => void
}

type NativeReadiumViewRef = React.Component & {
  reattachTtsViewport: (
    sessionId: string,
    viewportNavigationId: string,
  ) => Promise<boolean>
  returnToTtsPosition: (
    sessionId: string,
    viewportNavigationId: string,
  ) => Promise<boolean>
  startTts: (
    sessionId: string,
    config: TtsEngineConfig,
    fromLocator: Locator | undefined,
    startAtViewportStart: boolean,
    viewportDetached: boolean,
    viewportNavigationId: string | undefined,
  ) => Promise<void>
  playTts: () => Promise<void>
  pauseTts: () => Promise<void>
  stopTts: () => Promise<void>
  previousTts: () => Promise<void>
  nextTts: () => Promise<void>
  completeTtsSynthesis: (completion: TtsSynthesisCompletion) => Promise<void>
}

// `requireNativeView` returns a forwardRef host component at runtime, but its
// declared type omits `ref`. Re-declare it so we can grab the native tag via
// `findNodeHandle` for imperative navigation (matches ReadiumView.registry[id]).
const NativeReadiumView = requireNativeView<NativeReadiumViewProps>(
  "Readium",
) as React.ForwardRefExoticComponent<
  NativeReadiumViewProps & React.RefAttributes<NativeReadiumViewRef>
>

function forwardNativeEvent<T>(handler: ((event: T) => void) | undefined) {
  return handler
    ? (event: { nativeEvent: T }) => handler(event.nativeEvent)
    : undefined
}

export const ReadiumView = forwardRef<ReadiumViewRef, ReadiumProps>(
  (
    {
      onLocationChange,
      onPublicationReady,
      onDecorationActivated,
      onSelectionChange,
      onSelectionAction,
      onTap,
      onTtsStateChange,
      onTtsSynthesisRequest,
      onTtsSynthesisCancel,
      preferences,
      fontFamilyDeclarations,
      decorations,
      selectionActions,
      selectionMenu,
      customSelectionMenu,
      ...props
    },
    forwardedRef,
  ) => {
    const nativeRef = useRef<NativeReadiumViewRef>(null)
    const [{ height, width }, setDimensions] = useState<Dimensions>({
      width: 0,
      height: 0,
    })

    const onLayout = useCallback(
      ({
        nativeEvent: {
          layout: { width: layoutWidth, height: layoutHeight },
        },
      }: LayoutChangeEvent) => {
        setDimensions({ width: layoutWidth, height: layoutHeight })
      },
      [],
    )

    const handlePublicationReady = useCallback(
      (e: { nativeEvent: PublicationReadyEvent }) => {
        if (!onPublicationReady) return
        const ev = e.nativeEvent
        onPublicationReady({
          ...ev,
          tableOfContents: buildLinkTree(ev.tableOfContents),
        })
      },
      [onPublicationReady],
    )

    const tagOf = useCallback(() => findNodeHandle(nativeRef.current), [])

    useImperativeHandle(
      forwardedRef,
      () => ({
        goTo: (locator) => {
          const tag = tagOf()
          if (tag != null) ReadiumModule.goTo(tag, locator)
        },
        goForward: () => {
          const tag = tagOf()
          if (tag != null) ReadiumModule.goForward(tag)
        },
        goBackward: () => {
          const tag = tagOf()
          if (tag != null) ReadiumModule.goBackward(tag)
        },
        clearSelection: () => {
          const tag = tagOf()
          if (tag != null) ReadiumModule.clearSelection(tag)
        },
        getBookmarkLocator: () => {
          const tag = tagOf()
          return tag == null
            ? Promise.resolve(null)
            : ReadiumModule.getBookmarkLocator(tag)
        },
        isBookmarkVisible: (locator) => {
          const tag = tagOf()
          return tag == null
            ? Promise.resolve(false)
            : ReadiumModule.isBookmarkVisible(tag, locator)
        },
        reattachTtsViewport: (sessionId, viewportNavigationId) => {
          return (
            nativeRef.current?.reattachTtsViewport(
              sessionId,
              viewportNavigationId,
            ) ?? Promise.resolve(false)
          )
        },
        returnToTtsPosition: (sessionId, viewportNavigationId) => {
          return (
            nativeRef.current?.returnToTtsPosition(
              sessionId,
              viewportNavigationId,
            ) ?? Promise.resolve(false)
          )
        },
        startTts: async (config, fromLocator, options) => {
          const view = nativeRef.current
          if (!view) {
            throw new Error("TTS_READER_VIEW_UNAVAILABLE")
          }
          await view.startTts(
            options.sessionId,
            config,
            fromLocator,
            options.startAtViewportStart ?? false,
            options.viewportDetached ?? false,
            options.viewportNavigationId,
          )
        },
        playTts: () => {
          void nativeRef.current?.playTts()
        },
        pauseTts: () => {
          void nativeRef.current?.pauseTts()
        },
        stopTts: () => {
          void nativeRef.current?.stopTts()
        },
        previousTts: () => {
          void nativeRef.current?.previousTts()
        },
        nextTts: () => {
          void nativeRef.current?.nextTts()
        },
        completeTtsSynthesis: (completion) => {
          void nativeRef.current?.completeTtsSynthesis(completion)
        },
      }),
      [tagOf],
    )

    // Native side cleans up the navigator on view removal; no JS destroy call needed.
    useEffect(() => () => {}, [])

    const isReady = width > 0 && height > 0
    return (
      <View style={styles.container} onLayout={onLayout}>
        {isReady && (
          <NativeReadiumView
            ref={nativeRef}
            style={{ width, height }}
            {...props}
            preferences={preferences}
            fontFamilyDeclarations={fontFamilyDeclarations ?? []}
            decorations={decorations}
            selectionActions={selectionActions ?? []}
            selectionMenu={selectionMenu}
            customSelectionMenu={customSelectionMenu ?? false}
            onLocationChange={
              onLocationChange
                ? (e) =>
                    onLocationChange(
                      e.nativeEvent.locator,
                      e.nativeEvent.source,
                      e.nativeEvent.navigationId,
                      e.nativeEvent.navigationKind,
                    )
                : undefined
            }
            onPublicationReady={
              onPublicationReady ? handlePublicationReady : undefined
            }
            onDecorationActivated={forwardNativeEvent(onDecorationActivated)}
            onSelectionChange={forwardNativeEvent(onSelectionChange)}
            onSelectionAction={forwardNativeEvent(onSelectionAction)}
            onTap={forwardNativeEvent(onTap)}
            onTtsStateChange={forwardNativeEvent(onTtsStateChange)}
            onTtsSynthesisRequest={forwardNativeEvent(onTtsSynthesisRequest)}
            onTtsSynthesisCancel={forwardNativeEvent(onTtsSynthesisCancel)}
          />
        )}
      </View>
    )
  },
)

const styles = StyleSheet.create({
  container: { width: "100%", height: "100%" },
})
