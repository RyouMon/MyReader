import { StreamingStatusLine } from "@/src/components/streaming-status-line"
import { useInitialListPosition } from "@/src/features/reader/hooks/use-initial-list-position"
import { BottomSheetFlatList } from "@expo/ui/community/bottom-sheet"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { narrationCharacterColor } from "@my-reader/tools/narration-plan"
import { Button, FormSwitch } from "@/src/components"
import { StatusBadge } from "@/src/components/ui/status-badge"
import { useThemePalette } from "@/src/design/tokens"
import {
  readerFormColors,
  type ReaderChromePalette,
} from "@/src/design/reader-chrome-palette"
import { Text, View } from "@/tw"
import type { ReadingPlanController } from "@/src/features/reader/tts/use-reading-plan"
import type { NarrationPlanEntry } from "@/src/services/core/narration"
import { ReaderChoiceRow } from "./ReaderChoiceRow"
import { ReaderListManagementBar } from "./ReaderListSelectionControls"

export function NarrationReadingPlan({
  plan,
  palette,
}: {
  plan: ReadingPlanController
  palette: ReaderChromePalette
}) {
  const { t } = useTranslation()
  const theme = useThemePalette()
  const [managing, setManaging] = useState(false)
  const [selected, setSelected] = useState(new Set<string>())
  const toggle = useCallback(
    (id: string) =>
      setSelected((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    [],
  )
  const listPosition = useInitialListPosition<NarrationPlanEntry>(
    plan.currentIndex,
    plan.entries.length,
  )
  const activeId = plan.entries[plan.currentIndex]?.id
  const { play, jump } = plan
  const menuActions = useMemo(
    () => [{ id: "jump", title: t("narration.plan.jump") }],
    [t],
  )
  const renderItem = useCallback(
    ({ item }: { item: NarrationPlanEntry }) => (
      <ReaderChoiceRow
        title={item.speech.text}
        active={!managing && item.id === activeId}
        label={`${item.characterId === "narrator" ? t("narration.narrator") : item.characterName}: ${item.speech.text}. ${item.speech.instructions}`}
        detail={item.speech.instructions}
        badgePlacement="trailing"
        badge={
          <StatusBadge
            label={
              item.characterId === "narrator"
                ? t("narration.narrator")
                : item.characterName
            }
            colors={{
              surface: `${narrationCharacterColor(item.characterId)}25`,
              text: palette.text,
            }}
          />
        }
        selected={managing ? selected.has(item.id) : undefined}
        palette={palette}
        showChevron={false}
        menuActions={managing ? undefined : menuActions}
        onMenuAction={(action) => {
          if (action === "jump") jump(item.id)
        }}
        onPress={() => (managing ? toggle(item.id) : play(item.id))}
      />
    ),
    [managing, palette, play, jump, menuActions, selected, t, toggle, activeId],
  )
  return (
    <View className="flex-1">
      <View className="px-5">
        <View className="gap-3 pb-4 pt-3">
          <FormSwitch
            label={t("narration.plan.showMarks")}
            align="between"
            value={plan.shown}
            onValueChange={plan.setShown}
            colors={readerFormColors(palette)}
          />
          {plan.error ? (
            <Text
              className="px-4"
              accessibilityRole="alert"
              style={{ color: theme.danger }}
            >
              {plan.error}
            </Text>
          ) : null}
        </View>
      </View>
      <BottomSheetFlatList<NarrationPlanEntry>
        {...listPosition}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        data={plan.entries}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        ListEmptyComponent={
          <Text className="px-4" style={{ color: palette.textMuted }}>
            {t("narration.plan.empty")}
          </Text>
        }
      />
      <ReaderListManagementBar
        status={
          plan.analyzing ? (
            <StreamingStatusLine
              text={plan.progress}
              label={t("narration.plan.analyzing")}
              colors={readerFormColors(palette)}
            />
          ) : null
        }
        kind="readingPlan"
        palette={palette}
        managing={managing}
        mutationDisabled={false}
        deletionDisabled={!selected.size}
        selectedCount={selected.size}
        totalCount={plan.entries.length}
        toggleManagement={() => {
          setManaging(!managing)
          setSelected(new Set())
        }}
        toggleAll={() =>
          setSelected(
            selected.size === plan.entries.length
              ? new Set()
              : new Set(plan.entries.map((item) => item.id)),
          )
        }
        deleteSelected={async () => {
          try {
            await plan.clear([...selected])
            setSelected(new Set())
            setManaging(false)
          } catch {
            /* Owner displays failure. */
          }
        }}
        trailingAction={
          <Button
            variant="ghost"
            title={t(
              plan.analyzing ? "common.cancel" : "narration.plan.analyze",
            )}
            onPress={plan.analyzing ? plan.cancel : () => void plan.analyze()}
            disabled={plan.busy && !plan.analyzing}
            colors={{
              textColor: palette.accentText,
              underlayColor: palette.segmentActive,
            }}
          />
        }
      />
    </View>
  )
}
