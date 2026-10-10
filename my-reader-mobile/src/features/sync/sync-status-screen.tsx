import { syncFailureDetail, syncFailureKeys } from "@my-reader/i18n/mobile"
import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import * as Haptics from "expo-haptics"
import { useTranslation } from "react-i18next"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button, EmptyState, ListRow, SectionCard } from "@/src/components/ui"
import { useThemePalette } from "@/src/design/tokens"
import { useSyncLibrary } from "@/src/domain/sync/hooks/use-sync-library"
import { ScrollView, Text, View } from "@/tw"

import { SyncStatusIcon } from "./components/sync-status-icon"
import { useSyncStatusPresentation } from "./hooks/use-sync-status-presentation"
import {
  NO_SYNC_LIBRARY_EMPTY_STATE_ICON,
  SYNC_INDICATOR_LABEL_KEYS,
  SYNC_REASON_LABEL_KEYS,
  SYNC_STAGE_LABEL_KEYS,
} from "./sync-status-visuals"

function SyncProgressSlot({
  active,
  color,
  completed,
  label,
  textColor,
  total,
  trackColor,
}: {
  active: boolean
  color: string
  completed: number
  label: string | null
  textColor: string
  total: number
  trackColor: string
}) {
  const determinate = total > 0
  const progress = determinate ? Math.max(0, Math.min(completed / total, 1)) : 0

  return (
    <View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      className="h-12 w-full justify-center gap-2 px-6"
      style={{ opacity: active ? 1 : 0 }}
      testID="sync-status-progress-slot"
    >
      <View
        className="h-1.5 overflow-hidden rounded-full"
        style={{ backgroundColor: trackColor }}
      >
        {active ? (
          <View
            className="h-full rounded-full"
            style={{
              alignSelf: determinate ? "flex-start" : "center",
              backgroundColor: color,
              opacity: determinate ? 1 : 0.65,
              width: determinate ? `${progress * 100}%` : "36%",
            }}
          />
        ) : null}
      </View>
      <Text
        selectable={determinate}
        className="h-6 text-center text-base"
        style={{ color: textColor, fontVariant: ["tabular-nums"] }}
      >
        {label ?? "\u00a0"}
      </Text>
    </View>
  )
}

function SyncStatusSheetTitle({
  color,
  title,
}: {
  color: string
  title: string
}) {
  return (
    <View className="h-12 items-center justify-center">
      <Text
        accessibilityRole="header"
        className="text-base font-bold"
        style={{ color }}
      >
        {title}
      </Text>
    </View>
  )
}

type SyncPresentation = ReturnType<typeof useSyncStatusPresentation>

function SyncStatusSummary({
  activity,
  indicator,
  failureTitle,
}: Pick<SyncPresentation, "activity" | "indicator"> & {
  failureTitle?: string
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const statusLabel = t(SYNC_INDICATOR_LABEL_KEYS[indicator])
  const stageLabel = activity ? t(SYNC_STAGE_LABEL_KEYS[activity.stage]) : null
  const statusColor =
    indicator === "failed"
      ? palette.danger
      : indicator === "recent_success" || indicator === "unchanged"
        ? palette.success
        : indicator === "offline"
          ? palette.textMuted
          : indicator === "idle"
            ? palette.text
            : palette.primary
  const progressLabel =
    activity && activity.total > 0
      ? t("syncStatus.progress", {
          completed: activity.completed,
          total: activity.total,
        })
      : null

  return (
    <View
      accessibilityLabel={t("syncStatus.accessibilityLabel", {
        status: stageLabel ?? statusLabel,
      })}
      className="items-center py-4"
      testID="sync-status-summary"
    >
      <View className="h-12" />
      <View className="h-24 w-24 items-center justify-center">
        <SyncStatusIcon indicator={indicator} color={statusColor} size={60} />
      </View>
      <Text
        accessibilityLiveRegion="polite"
        selectable
        className="-mt-3 min-h-8 text-center text-xl font-bold"
        style={{ color: statusColor }}
      >
        {failureTitle
          ? t("syncStatus.failureSummary", { title: failureTitle })
          : (stageLabel ?? statusLabel)}
      </Text>

      {!failureTitle ? (
        <SyncProgressSlot
          active={activity != null}
          color={palette.primary}
          completed={activity?.completed ?? 0}
          label={progressLabel}
          textColor={palette.textMuted}
          total={activity?.total ?? 0}
          trackColor={palette.border}
        />
      ) : null}
    </View>
  )
}

function SyncHistoryDetails({
  libraryName,
  activity,
  indicator,
  transientResult,
  history,
}: Pick<
  SyncPresentation,
  "activity" | "indicator" | "transientResult" | "history"
> & { libraryName: string }) {
  const { t, i18n } = useTranslation()
  const statusLabel = t(SYNC_INDICATOR_LABEL_KEYS[indicator])
  const stageLabel = activity ? t(SYNC_STAGE_LABEL_KEYS[activity.stage]) : null
  const lastFailure = history?.lastFailure
  const lastSync = history?.lastSync
  const reason =
    activity?.reason ??
    transientResult?.reason ??
    lastFailure?.reason ??
    lastSync?.reason
  const reasonLabel = reason ? t(SYNC_REASON_LABEL_KEYS[reason]) : null
  const lastSyncTime = lastSync
    ? formatHumanReadableTime(lastSync.completedAt, i18n.language)
    : t("syncStatus.noHistory")
  const lastAttemptTime = lastFailure
    ? formatHumanReadableTime(lastFailure.completedAt, i18n.language)
    : null

  return (
    <SectionCard>
      <ListRow
        isLast
        title={t("syncStatus.currentLibrary")}
        value={libraryName}
      />
      <ListRow
        isLast
        title={t("syncStatus.currentStatus")}
        value={statusLabel}
      />
      {stageLabel ? (
        <ListRow
          isLast
          title={t("syncStatus.currentStage")}
          value={stageLabel}
        />
      ) : null}
      {reasonLabel ? (
        <ListRow
          isLast
          title={t(
            activity || transientResult
              ? "syncStatus.currentReason"
              : "syncStatus.lastReason",
          )}
          value={reasonLabel}
        />
      ) : null}
      {!activity && lastFailure?.failureStage ? (
        <ListRow
          isLast
          title={t("syncStatus.failureStage")}
          value={t(SYNC_STAGE_LABEL_KEYS[lastFailure.failureStage])}
        />
      ) : null}
      {lastAttemptTime ? (
        <ListRow
          isLast
          title={t("syncStatus.lastAttempt")}
          value={lastAttemptTime}
        />
      ) : null}
      <ListRow isLast title={t("syncStatus.lastSync")} value={lastSyncTime} />
    </SectionCard>
  )
}

export default function SyncStatusScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const insets = useSafeAreaInsets()
  const {
    activeLibraryId,
    activity,
    history,
    indicator,
    isOffline,
    library,
    transientResult,
  } = useSyncStatusPresentation()
  const { isSyncing: isManualSyncing, syncNow } = useSyncLibrary()
  const failureKeys = syncFailureKeys(history?.lastFailure?.failureKind)

  if (!library || !activeLibraryId) {
    return (
      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <SyncStatusSheetTitle
          color={palette.text}
          title={t("syncStatus.title")}
        />
        <View className="flex-1 px-4 pb-10 pt-4">
          <EmptyState
            title={t("syncStatus.noActiveLibrary")}
            detail={t("syncStatus.noActiveLibraryDetail")}
            icon={NO_SYNC_LIBRARY_EMPTY_STATE_ICON}
            layout="container"
          />
        </View>
      </View>
    )
  }

  const isRunning = activity != null || isManualSyncing
  const canSync = !isRunning && !isOffline
  const failure =
    indicator === "failed" && !isRunning ? history?.lastFailure : undefined

  const handleSync = () => {
    if (!canSync) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void syncNow(activeLibraryId, { showFailureAlert: false }).catch(() => {})
  }

  return (
    <>
      <ScrollView
        accessibilityLabel={t("syncStatus.details")}
        className="flex-1"
        contentContainerClassName="pb-28"
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: palette.background }}
        stickyHeaderIndices={[0]}
        testID="sync-status-details-scroll"
      >
        <View
          collapsable={false}
          className="px-4"
          style={{ backgroundColor: palette.background }}
        >
          <SyncStatusSheetTitle
            color={palette.text}
            title={t("syncStatus.title")}
          />

          <SyncStatusSummary
            activity={activity}
            indicator={indicator}
            failureTitle={failure ? t(failureKeys.title) : undefined}
          />
        </View>

        <View className="gap-5 px-4 py-4 pb-6">
          {failure ? (
            <Text
              selectable
              className="text-base"
              style={{ color: palette.text }}
              testID="sync-status-error-detail"
            >
              {syncFailureDetail(t(failureKeys.detail), failure)}
            </Text>
          ) : null}
          <SyncHistoryDetails
            libraryName={library.name}
            activity={activity}
            indicator={indicator}
            transientResult={transientResult}
            history={history}
          />

          {isOffline ? (
            <View
              className="gap-2 rounded-xl p-4"
              style={{ backgroundColor: palette.warningSoft }}
            >
              <Text
                className="text-base font-bold"
                style={{ color: palette.warning }}
              >
                {t("syncStatus.waitingForNetwork")}
              </Text>
              <Text
                selectable
                className="text-base"
                style={{ color: palette.text }}
              >
                {t("syncStatus.offlineDetail")}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View
        className="absolute inset-x-0 bottom-0 px-4 pt-3"
        style={{
          backgroundColor: palette.background,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
        testID="sync-status-action-footer"
      >
        <Button
          accessibilityLabel={
            isOffline
              ? t("syncStatus.waitingForNetwork")
              : t("syncStatus.manualSync")
          }
          disabled={!canSync}
          loading={isRunning}
          onPress={handleSync}
          textClassName="text-base"
          title={
            isRunning
              ? t("syncStatus.syncingAction")
              : isOffline
                ? t("syncStatus.waitingForNetwork")
                : t("syncStatus.manualSync")
          }
        />
      </View>
    </>
  )
}
