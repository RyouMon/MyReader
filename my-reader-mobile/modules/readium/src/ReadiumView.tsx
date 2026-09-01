import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { findNodeHandle, StyleSheet, View } from "react-native"
import { requireNativeView } from "expo"

import type {
  Dimensions,
  Locator,
  Preferences,
  ReadiumFile,
  FontFamilyDeclaration,
  DecorationGroup,
  SelectionAction,
  SelectionMenuConfig,
  PublicationReadyEvent,
  DecorationActivatedEvent,
  SelectionEvent,
  SelectionActionEvent,
  TapEvent,
  TtsPlaybackState,
  TtsSynthesisCancelEvent,
  TtsSynthesisRequestEvent,
} from "./types"
import { buildLinkTree } from "./utils/buildLinkTree"
import { ReadiumModule } from "./ReadiumModule"
import type { ReadiumViewRef, ReadiumProps } from "./ReadiumView.types"

export type { ReadiumViewRef, ReadiumProps } from "./ReadiumView.types"

/** Props the native Expo View accepts (props + onXxx event handlers). */
type NativeReadiumViewProps = {
  file: ReadiumFile
  preferences?: Preferences
  fontFamilyDeclarations?: FontFamilyDeclaration[]
  decorations?: DecorationGroup[]
  selectionActions?: SelectionAction[]
  selectionMenu?: SelectionMenuConfig
  customSelectionMenu?: boolean
  style?: any
  onLocationChange?: (e: {
    nativeEvent: { locator: Locator; source?: "tts" }
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

// `requireNativeView` returns a forwardRef host component at runtime, but its
// declared type omits `ref`. Re-declare it so we can grab the native tag via
// `findNodeHandle` for imperative navigation (matches ReadiumView.registry[id]).
const NativeReadiumView = requireNativeView<NativeReadiumViewProps>(
  "Readium",
) as React.ForwardRefExoticComponent<
  NativeReadiumViewProps & React.RefAttributes<unknown>
>

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
    const nativeRef = useRef<any>(null)
    const [{ height, width }, setDimensions] = useState<Dimensions>({
      width: 0,
      height: 0,
    })

    const onLayout = useCallback(
      ({
        nativeEvent: {
          layout: { width: layoutWidth, height: layoutHeight },
        },
      }: any) => {
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

    const tagOf = () => findNodeHandle(nativeRef.current)

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
        startTts: (config, fromLocator, options) => {
          const tag = tagOf()
          if (tag != null) {
            void ReadiumModule.startTts(
              tag,
              config,
              fromLocator,
              options?.startAtViewportStart ?? false,
            )
          }
        },
        playTts: () => {
          const tag = tagOf()
          if (tag != null) void ReadiumModule.playTts(tag)
        },
        pauseTts: () => {
          const tag = tagOf()
          if (tag != null) void ReadiumModule.pauseTts(tag)
        },
        stopTts: () => {
          const tag = tagOf()
          if (tag != null) void ReadiumModule.stopTts(tag)
        },
        previousTts: () => {
          const tag = tagOf()
          if (tag != null) void ReadiumModule.previousTts(tag)
        },
        nextTts: () => {
          const tag = tagOf()
          if (tag != null) void ReadiumModule.nextTts(tag)
        },
        completeTtsSynthesis: (completion) => {
          const tag = tagOf()
          if (tag != null) {
            void ReadiumModule.completeTtsSynthesis(tag, completion)
          }
        },
      }),
      [],
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
                    )
                : undefined
            }
            onPublicationReady={
              onPublicationReady ? handlePublicationReady : undefined
            }
            onDecorationActivated={
              onDecorationActivated
                ? (e) => onDecorationActivated(e.nativeEvent)
                : undefined
            }
            onSelectionChange={
              onSelectionChange
                ? (e) => onSelectionChange(e.nativeEvent)
                : undefined
            }
            onSelectionAction={
              onSelectionAction
                ? (e) => onSelectionAction(e.nativeEvent)
                : undefined
            }
            onTap={onTap ? (e) => onTap(e.nativeEvent) : undefined}
            onTtsStateChange={
              onTtsStateChange
                ? (e) => onTtsStateChange(e.nativeEvent)
                : undefined
            }
            onTtsSynthesisRequest={
              onTtsSynthesisRequest
                ? (e) => onTtsSynthesisRequest(e.nativeEvent)
                : undefined
            }
            onTtsSynthesisCancel={
              onTtsSynthesisCancel
                ? (e) => onTtsSynthesisCancel(e.nativeEvent)
                : undefined
            }
          />
        )}
      </View>
    )
  },
)

const styles = StyleSheet.create({
  container: { width: "100%", height: "100%" },
})
