import {
  createContext,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native"
import { ListRow } from "@/src/components/ui/list-row"
import { SectionCard } from "@/src/components/ui/section-card"
import { useThemePalette } from "@/src/design/tokens"

export type SuggestionOverlayItem = {
  key: string
  title: string
  detail?: string
  value?: string
  label?: string
}

export type AnchoredSuggestionsProps = {
  anchor: RefObject<View | null>
  items: readonly SuggestionOverlayItem[]
  accessibilityLabel: string
  onChoose: (item: SuggestionOverlayItem) => void
  onDismiss: () => void
  rowHeight?: number
  gap?: number
  listTestID?: string
  dismissTestID?: string
  compactRow?: boolean
}

type SuggestionsContextValue = {
  publish: Dispatch<SetStateAction<AnchoredSuggestionsProps | null>>
  dismiss: () => void
}

const SuggestionsContext = createContext<SuggestionsContextValue | null>(null)

export function useDismissSuggestions(): () => void {
  const context = useContext(SuggestionsContext)
  return useCallback(() => {
    context?.dismiss()
  }, [context])
}

export function SuggestionsOverlayHost({
  children,
  testID = "suggestions-overlay-host",
}: {
  children: ReactNode
  testID?: string
}) {
  const container = useRef<View>(null)
  const [suggestions, setSuggestions] =
    useState<AnchoredSuggestionsProps | null>(null)
  const dismissRef = useRef<(() => void) | undefined>(undefined)
  dismissRef.current = suggestions?.onDismiss
  const dismiss = useCallback(() => {
    dismissRef.current?.()
  }, [])
  const contextValue = useMemo(
    () => ({ publish: setSuggestions, dismiss }),
    [dismiss],
  )
  // iOS tracks the first scroll view for large titles and scroll-edge effects.
  return (
    <SuggestionsContext.Provider value={contextValue}>
      {children}
      <View
        ref={container}
        testID={testID}
        pointerEvents="box-none"
        collapsable={false}
        style={StyleSheet.absoluteFill}
      >
        {suggestions ? (
          <SuggestionsPopup {...suggestions} container={container} />
        ) : null}
      </View>
    </SuggestionsContext.Provider>
  )
}

export function AnchoredSuggestions(props: AnchoredSuggestionsProps) {
  const context = useContext(SuggestionsContext)
  const publish = context?.publish
  const {
    anchor,
    items,
    accessibilityLabel,
    onChoose,
    onDismiss,
    rowHeight,
    gap,
    listTestID,
    dismissTestID,
    compactRow,
  } = props
  useLayoutEffect(() => {
    publish?.(
      items.length
        ? {
            anchor,
            items,
            accessibilityLabel,
            onChoose,
            onDismiss,
            rowHeight,
            gap,
            listTestID,
            dismissTestID,
            compactRow,
          }
        : null,
    )
    return () => publish?.(null)
  }, [
    publish,
    anchor,
    items,
    accessibilityLabel,
    onChoose,
    onDismiss,
    rowHeight,
    gap,
    listTestID,
    dismissTestID,
    compactRow,
  ])
  return null
}

function SuggestionsPopup({
  anchor,
  container,
  items,
  accessibilityLabel,
  onChoose,
  onDismiss,
  rowHeight,
  gap = 0,
  listTestID,
  dismissTestID,
  compactRow,
}: AnchoredSuggestionsProps & { container: RefObject<View | null> }) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { width, height, fontScale } = useWindowDimensions()
  const [bounds, setBounds] = useState<{
    left: number
    top: number
    width: number
    maxHeight: number
  } | null>(null)
  const measure = useCallback(() => {
    container.current?.measureInWindow(
      (containerX, containerY, _width, containerHeight) => {
        anchor.current?.measureInWindow((x, y, anchorWidth, anchorHeight) => {
          const bottom = Math.min(
            containerY + containerHeight,
            Keyboard.metrics()?.screenY ?? height,
          )
          const top = y + anchorHeight - containerY + gap
          setBounds({
            left: x - containerX,
            top,
            width: anchorWidth,
            maxHeight: Math.max(
              0,
              Math.min(
                (rowHeight ?? 56) * 4,
                bottom - (y + anchorHeight + gap) - 8,
              ),
            ),
          })
        })
      },
    )
  }, [anchor, container, gap, height, rowHeight])
  useLayoutEffect(measure, [measure, items, width, fontScale])
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", measure)
    const hide = Keyboard.addListener("keyboardDidHide", onDismiss)
    return () => {
      show.remove()
      hide.remove()
    }
  }, [measure, onDismiss])
  if (!bounds || bounds.maxHeight === 0) return null
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: bounds.top,
        bottom: 0,
        left: 0,
        right: 0,
      }}
    >
      <Pressable
        testID={dismissTestID}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={{
          marginLeft: bounds.left,
          width: bounds.width,
        }}
      >
        <SectionCard
          rounded={Platform.OS === "ios"}
          style={{ boxShadow: `0 2px 8px ${palette.overlay}` }}
        >
          <ScrollView
            testID={listTestID}
            accessibilityLabel={accessibilityLabel}
            focusable={false}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            style={{ maxHeight: bounds.maxHeight }}
          >
            {items.map((item, index) => (
              <ListRow
                key={item.key}
                title={item.title}
                titleWeight={item.detail ? "normal" : undefined}
                detail={item.detail}
                value={item.value}
                label={item.label ?? item.title}
                isLast={index === items.length - 1}
                onPress={() => onChoose(item)}
                contentStyle={
                  compactRow
                    ? {
                        minHeight: rowHeight ?? 56,
                        paddingVertical: 0,
                        alignItems: "center",
                      }
                    : {
                        minHeight: rowHeight ?? 68,
                        paddingVertical: 10,
                        alignItems: "center",
                      }
                }
              />
            ))}
          </ScrollView>
        </SectionCard>
      </View>
    </View>
  )
}
