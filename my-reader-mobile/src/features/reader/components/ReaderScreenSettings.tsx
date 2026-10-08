import type { ComponentProps } from "react"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import { useAppStore } from "@/src/store/app-store"
import type {
  FixedReaderSettings,
  ReflowableReaderSettings,
  FontFamilyKey,
} from "@/src/store/app-store.types"
import ReaderSettingsSheet from "./reader/chrome/ReaderSettingsSheet"
import type { ReaderFontOption } from "./reader/reflow/reader-font-options"

export function ReaderScreenSettings({
  sheetRef,
  chromePalette,
  onDismiss,
  layoutMode,
  format,
  reflowSettings,
  fixedSettings,
  activeFontFamily,
  fontOptions,
  activeFontLanguageKey,
}: {
  sheetRef: ComponentProps<typeof ReaderSettingsSheet>["ref"]
  chromePalette: ReaderChromePalette
  onDismiss: () => void
  layoutMode: "reflowable" | "fixedLayout" | "unknown"
  format: string
  reflowSettings: ReflowableReaderSettings
  fixedSettings: FixedReaderSettings
  activeFontFamily: FontFamilyKey
  fontOptions: ReaderFontOption[]
  activeFontLanguageKey: string
}) {
  const patchReflowableReaderSettings = useAppStore(
    (s) => s.patchReflowableReaderSettings,
  )
  const patchFixedReaderSettings = useAppStore(
    (s) => s.patchFixedReaderSettings,
  )
  const isReflowSurface = layoutMode === "reflowable"
  // CBZ renders through Readium's FXL EPUB navigator, whose paginator is
  // horizontal-only and ignores `scroll` — so 上下翻页 can't apply to CBZ.
  const isCbzFixed =
    layoutMode === "fixedLayout" && format.toUpperCase() === "CBZ"
  return (
    <ReaderSettingsSheet
      ref={sheetRef}
      palette={chromePalette}
      onDismiss={onDismiss}
      layout={isReflowSurface ? "reflowable" : "fixed"}
      reflow={
        isReflowSurface
          ? {
              theme: reflowSettings.theme,
              onThemeChange: (key) =>
                patchReflowableReaderSettings({ theme: key }),
              fontFamily: activeFontFamily,
              fontOptions,
              onFontFamilyChange: (v) =>
                patchReflowableReaderSettings({
                  fontFamiliesByLanguage: {
                    ...reflowSettings.fontFamiliesByLanguage,
                    [activeFontLanguageKey]: v,
                  },
                }),
              fontSize: reflowSettings.fontSize,
              onFontSizeChange: (v) =>
                patchReflowableReaderSettings({ fontSize: v }),
              fontSizeMin: 14,
              fontSizeMax: 28,
              lineHeight: reflowSettings.lineHeight,
              onLineHeightChange: (v) =>
                patchReflowableReaderSettings({ lineHeight: v }),
              lineHeightMin: 1.4,
              lineHeightMax: 2.4,
              margin: reflowSettings.paddingX,
              onMarginChange: (v) =>
                patchReflowableReaderSettings({ paddingX: v }),
              marginMin: 12,
              marginMax: 36,
              textAlign: reflowSettings.textAlign,
              onTextAlignChange: (v) =>
                patchReflowableReaderSettings({ textAlign: v }),
              columnCount: reflowSettings.columnCount,
              onColumnCountChange: (v) =>
                patchReflowableReaderSettings({ columnCount: v }),
            }
          : undefined
      }
      fixed={
        !isReflowSurface
          ? {
              background: fixedSettings.background,
              onBackgroundChange: (v) =>
                patchFixedReaderSettings({ background: v }),
              navigationMode: fixedSettings.navigationMode,
              onNavigationModeChange: (v) =>
                patchFixedReaderSettings({ navigationMode: v }),
              showPageDirection: !isCbzFixed,
              readingProgression: fixedSettings.readingProgression,
              onReadingProgressionChange: (v) =>
                patchFixedReaderSettings({ readingProgression: v }),
              spread: fixedSettings.spread,
              onSpreadChange: (v) => patchFixedReaderSettings({ spread: v }),
            }
          : undefined
      }
    />
  )
}
