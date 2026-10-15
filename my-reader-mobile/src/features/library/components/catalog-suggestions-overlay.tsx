import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react"
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native"
import { useTranslation } from "react-i18next"
import {
  tokenKey,
  type CatalogToken,
} from "@my-reader/tools/catalog-navigation"
import { useThemePalette } from "@/src/design/tokens"
import { ListRow } from "@/src/components/ui/list-row"
import { SectionCard } from "@/src/components/ui/section-card"

type Suggestions = {
  anchor: RefObject<View | null>
  items: CatalogToken[]
  onChoose: (token: CatalogToken) => void
  onDismiss: () => void
  rowHeight?: number
}

const SuggestionsContext = createContext<Dispatch<
  SetStateAction<Suggestions | null>
> | null>(null)

export function CatalogSuggestionsHost({ children }: { children: ReactNode }) {
  const container = useRef<View>(null)
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null)
  // iOS tracks the first scroll view for large titles and scroll-edge effects.
  return (
    <SuggestionsContext.Provider value={setSuggestions}>
      {children}
      <View
        ref={container}
        testID="catalog-suggestions-host"
        pointerEvents="box-none"
        collapsable={false}
        style={StyleSheet.absoluteFill}
      >
        {suggestions && (
          <SuggestionsPopup {...suggestions} container={container} />
        )}
      </View>
    </SuggestionsContext.Provider>
  )
}

// Keep the popup outside the virtualized list header so its bounds accept taps.
export function CatalogSuggestions(props: Suggestions) {
  const publish = use(SuggestionsContext)
  const { anchor, items, onChoose, onDismiss, rowHeight } = props
  useLayoutEffect(() => {
    publish?.(
      items.length ? { anchor, items, onChoose, onDismiss, rowHeight } : null,
    )
    return () => publish?.(null)
  }, [publish, anchor, items, onChoose, onDismiss, rowHeight])
  return null
}

function SuggestionsPopup({
  anchor,
  container,
  items,
  onChoose,
  onDismiss,
  rowHeight,
}: Suggestions & { container: RefObject<View | null> }) {
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
          setBounds({
            left: x - containerX,
            top: y + anchorHeight - containerY,
            width: anchorWidth,
            maxHeight: Math.max(
              0,
              Math.min((rowHeight ?? 56) * 4, bottom - y - anchorHeight - 8),
            ),
          })
        })
      },
    )
  }, [anchor, container, height, rowHeight])
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
        testID="catalog-suggestions-dismiss"
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        onPress={onDismiss}
        style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
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
            testID="catalog-suggestions"
            accessibilityLabel={t("catalog.suggestions")}
            focusable={false}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            style={{ maxHeight: bounds.maxHeight }}
          >
            {items.map((token, index) => (
              <ListRow
                key={tokenKey(token)}
                title={token.value}
                value={t(`catalog.${token.kind}`)}
                label={`${t(`catalog.${token.kind}`)}, ${token.value}`}
                isLast={index === items.length - 1}
                onPress={() => onChoose(token)}
                contentStyle={{
                  minHeight: rowHeight ?? 56,
                  paddingVertical: 0,
                  alignItems: "center",
                }}
              />
            ))}
          </ScrollView>
        </SectionCard>
      </View>
    </View>
  )
}
