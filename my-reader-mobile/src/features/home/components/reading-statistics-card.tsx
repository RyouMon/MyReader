import { MaterialIcons } from "@expo/vector-icons"
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { Modal, useWindowDimensions } from "react-native"
import type {
  GestureResponderEvent,
  LayoutChangeEvent,
  ScrollView as RNScrollView,
} from "react-native"

import type { Library } from "@/src/domain/types"
import {
  buildReadingYearWeeks,
  readingHeatmapScrollOffset,
} from "@/src/domain/reading-statistics/calendar"
import type { ReadingHeatmapDay } from "@/src/domain/reading-statistics/calendar"
import { useReadingStatistics } from "@/src/domain/reading-statistics/hooks/use-reading-statistics"
import {
  localDayKey,
  readingIntensityLevel,
} from "@/src/domain/reading-statistics/statistics"
import { useThemePalette } from "@/src/design/tokens"
import { Pressable, ScrollView, Text, View } from "@/tw"

const CELL_SIZE = 14
const CELL_GAP = 4
const CELL_STEP = CELL_SIZE + CELL_GAP
const MONTH_LABEL_HEIGHT = 28
const POPOVER_WIDTH = 244
const POPOVER_HEIGHT = 44
const POPOVER_ARROW_SIZE = 6
const POPOVER_CELL_GAP = 24
const POPOVER_MARGIN = 12
const SCRUB_ACTIVATION_DELAY_MS = 140
const EMPTY_DAYS: Record<string, number> = {}

type Translate = (key: string, params?: Record<string, unknown>) => string

type DayPopover = {
  dayKey: string
  anchorX: number
  cellBottomY: number
  cellTopY: number
  column: number
  row: number
}

type HeatmapGridOrigin = {
  x: number
  y: number
}

type HeatmapCellsProps = {
  backgroundColor: string
  cancelable: boolean
  dayFormatter: Intl.DateTimeFormat
  days: Record<string, number>
  onPressIn: (
    dayKey: string,
    column: number,
    row: number,
    event: GestureResponderEvent,
  ) => void
  onPressMove: (event: GestureResponderEvent) => void
  onTouchEnd: () => void
  primaryColor: string
  t: Translate
  todayKey: string
  weeks: ReadingHeatmapDay[][]
}

function durationText(seconds: number, t: Translate) {
  if (seconds <= 0) return t("home.readingStats.noRecord")
  return t("home.readingStats.readingMinutes", {
    count: Math.max(1, Math.round(seconds / 60)),
  })
}

const HeatmapCells = memo(function HeatmapCells({
  backgroundColor,
  cancelable,
  dayFormatter,
  days,
  onPressIn,
  onPressMove,
  onTouchEnd,
  primaryColor,
  t,
  todayKey,
  weeks,
}: HeatmapCellsProps) {
  return (
    <View className="flex-row" style={{ gap: CELL_GAP }}>
      {weeks.map((week, column) => (
        <View key={column} style={{ gap: CELL_GAP }}>
          {week.map((day, row) => {
            if (!day.inYear) {
              return (
                <View
                  key={day.key}
                  style={{ height: CELL_SIZE, width: CELL_SIZE }}
                />
              )
            }

            const duration = days[day.key] ?? 0
            const level = readingIntensityLevel(duration)
            const isFuture = day.key > todayKey
            const feedbackText = `${dayFormatter.format(day.date)} · ${durationText(duration, t)}`
            return (
              <Pressable
                key={day.key}
                testID={`reading-statistics-day-${day.key}`}
                accessibilityRole="button"
                accessibilityLabel={feedbackText}
                cancelable={cancelable}
                disabled={isFuture}
                hitSlop={2}
                onPressIn={(event) => onPressIn(day.key, column, row, event)}
                onPressMove={onPressMove}
                onTouchCancel={onTouchEnd}
                onTouchEnd={onTouchEnd}
                style={{
                  backgroundColor: level === 0 ? backgroundColor : primaryColor,
                  borderRadius: 3,
                  height: CELL_SIZE,
                  opacity:
                    level === 0
                      ? isFuture
                        ? 0.45
                        : 1
                      : [0, 0.35, 0.55, 0.75, 1][level],
                  width: CELL_SIZE,
                }}
              />
            )
          })}
        </View>
      ))}
    </View>
  )
})

export function ReadingStatisticsCard({
  library,
  onInspectingChange,
}: {
  library: Library
  onInspectingChange?: (isInspecting: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const palette = useThemePalette()
  const { width: windowWidth } = useWindowDimensions()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [popover, setPopover] = useState<DayPopover | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const activeDayKeyRef = useRef<string | null>(null)
  const isScrubbingRef = useRef(false)
  const activeScrubRef = useRef<HeatmapGridOrigin | null>(null)
  const scrubActivationTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const heatmapScrollRef = useRef<RNScrollView>(null)
  const heatmapViewportWidthRef = useRef(0)
  const { data: statistics } = useReadingStatistics(library, year)
  const weeks = useMemo(() => buildReadingYearWeeks(year), [year])
  const todayKey = localDayKey(new Date())
  const today = new Date()
  const targetDay = Math.min(
    today.getDate(),
    new Date(year, today.getMonth() + 1, 0).getDate(),
  )
  const targetDayKey = localDayKey(new Date(year, today.getMonth(), targetDay))
  const days = statistics?.days ?? EMPTY_DAYS
  const totalDurationSeconds = statistics?.totalDurationSeconds ?? 0
  const longestStreakDays = statistics?.longestStreakDays ?? 0
  const completedBooks = statistics?.completedBooks ?? 0
  const heatmapWidth = weeks.length * CELL_STEP - CELL_GAP
  const selectedDuration = popover ? (days[popover.dayKey] ?? 0) : 0

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: "short" }),
    [i18n.resolvedLanguage],
  )
  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        month: "long",
        day: "numeric",
      }),
    [i18n.resolvedLanguage],
  )
  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage, {
        maximumFractionDigits: 1,
      }),
    [i18n.resolvedLanguage],
  )

  const monthMarkers = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) => {
        const dayKey = localDayKey(new Date(year, month, 1))
        const column = weeks.findIndex((week) =>
          week.some((day) => day.key === dayKey),
        )
        return {
          key: dayKey,
          column,
          label: monthFormatter.format(new Date(year, month, 1)),
        }
      }),
    [monthFormatter, weeks, year],
  )

  const feedback = popover
    ? `${dayFormatter.format(new Date(`${popover.dayKey}T12:00:00`))} · ${durationText(selectedDuration, t)}`
    : ""

  const clearScrubActivation = useCallback(() => {
    if (scrubActivationTimeoutRef.current === null) return
    clearTimeout(scrubActivationTimeoutRef.current)
    scrubActivationTimeoutRef.current = null
  }, [])

  const hidePopover = useCallback(() => {
    clearScrubActivation()
    activeDayKeyRef.current = null
    isScrubbingRef.current = false
    activeScrubRef.current = null
    setIsScrubbing(false)
    setPopover(null)
    onInspectingChange?.(false)
  }, [clearScrubActivation, onInspectingChange])

  useEffect(
    () => () => {
      clearScrubActivation()
      onInspectingChange?.(false)
    },
    [clearScrubActivation, onInspectingChange],
  )

  const showDayPopover = useCallback(
    (
      dayKey: string,
      column: number,
      row: number,
      origin: HeatmapGridOrigin,
    ) => {
      if (activeDayKeyRef.current === dayKey) return
      activeDayKeyRef.current = dayKey
      const cellTopY = origin.y + row * CELL_STEP
      setPopover({
        dayKey,
        anchorX: origin.x + column * CELL_STEP + CELL_SIZE / 2,
        cellBottomY: cellTopY + CELL_SIZE,
        cellTopY,
        column,
        row,
      })
    },
    [],
  )

  const startDayScrub = useCallback(
    (
      dayKey: string,
      column: number,
      row: number,
      event: GestureResponderEvent,
    ) => {
      const origin = {
        x:
          event.nativeEvent.pageX -
          event.nativeEvent.locationX -
          column * CELL_STEP,
        y:
          event.nativeEvent.pageY -
          event.nativeEvent.locationY -
          row * CELL_STEP,
      }
      activeScrubRef.current = origin
      clearScrubActivation()
      scrubActivationTimeoutRef.current = setTimeout(() => {
        scrubActivationTimeoutRef.current = null
        isScrubbingRef.current = true
        setIsScrubbing(true)
        onInspectingChange?.(true)
        showDayPopover(dayKey, column, row, origin)
      }, SCRUB_ACTIVATION_DELAY_MS)
    },
    [clearScrubActivation, onInspectingChange, showDayPopover],
  )

  const moveDayScrub = useCallback(
    (event: GestureResponderEvent) => {
      if (!isScrubbingRef.current) return
      const origin = activeScrubRef.current
      if (!origin) return

      const column = Math.round(
        (event.nativeEvent.pageX - origin.x - CELL_SIZE / 2) / CELL_STEP,
      )
      const row = Math.round(
        (event.nativeEvent.pageY - origin.y - CELL_SIZE / 2) / CELL_STEP,
      )
      const day = weeks[column]?.[row]
      if (!day?.inYear || day.key > todayKey) return
      showDayPopover(day.key, column, row, origin)
    },
    [showDayPopover, todayKey, weeks],
  )

  const scrollToTargetDay = useCallback(
    (viewportWidth: number) => {
      if (viewportWidth <= 0) return
      const targetColumn = weeks.findIndex((week) =>
        week.some((day) => day.key === targetDayKey),
      )
      heatmapScrollRef.current?.scrollTo?.({
        x: readingHeatmapScrollOffset(
          targetColumn,
          CELL_STEP,
          heatmapWidth,
          viewportWidth,
        ),
        animated: false,
      })
    },
    [heatmapWidth, targetDayKey, weeks],
  )

  const handleHeatmapLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const viewportWidth = event.nativeEvent.layout.width
      heatmapViewportWidthRef.current = viewportWidth
      scrollToTargetDay(viewportWidth)
    },
    [scrollToTargetDay],
  )

  const showPopoverAbove = Boolean(
    popover &&
      popover.cellTopY >=
        POPOVER_HEIGHT + POPOVER_ARROW_SIZE + POPOVER_CELL_GAP + POPOVER_MARGIN,
  )
  const popoverLeft = popover
    ? Math.max(
        POPOVER_MARGIN,
        Math.min(
          windowWidth - POPOVER_WIDTH - POPOVER_MARGIN,
          popover.anchorX - POPOVER_WIDTH / 2,
        ),
      )
    : 0
  const popoverTop = popover
    ? showPopoverAbove
      ? popover.cellTopY -
        POPOVER_HEIGHT -
        POPOVER_ARROW_SIZE -
        POPOVER_CELL_GAP
      : popover.cellBottomY + POPOVER_ARROW_SIZE + POPOVER_CELL_GAP
    : 0
  const popoverArrowLeft = popover
    ? Math.max(
        POPOVER_MARGIN,
        Math.min(
          POPOVER_WIDTH - POPOVER_MARGIN - POPOVER_ARROW_SIZE * 2,
          popover.anchorX - popoverLeft - POPOVER_ARROW_SIZE,
        ),
      )
    : 0

  const metrics = [
    {
      value: `${longestStreakDays}${t("home.readingStats.dayUnit")}`,
      label: t("home.readingStats.streak"),
    },
    {
      value: `${numberFormatter.format(totalDurationSeconds / 3600)}${t("home.readingStats.hourUnit")}`,
      label: t("home.readingStats.totalDuration"),
    },
    {
      value: `${completedBooks}${t("home.readingStats.bookUnit")}`,
      label: t("home.readingStats.completed"),
    },
  ]

  return (
    <View
      className="gap-2 rounded-3xl border p-3"
      style={{ backgroundColor: palette.surface, borderColor: palette.border }}
    >
      <View className="flex-row items-stretch py-1">
        {metrics.map((metric, index) => (
          <Fragment key={metric.label}>
            <View className="flex-1 items-center gap-1 px-2 py-1">
              <Text
                className="text-base font-bold"
                style={{ color: palette.text }}
              >
                {metric.value}
              </Text>
              <Text
                className="text-base text-center"
                style={{ color: palette.textMuted }}
              >
                {metric.label}
              </Text>
            </View>
            {index < metrics.length - 1 ? (
              <View
                className="my-1 w-px"
                style={{ backgroundColor: palette.borderStrong }}
              />
            ) : null}
          </Fragment>
        ))}
      </View>

      <View className="h-11 flex-row items-center justify-center gap-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("home.readingStats.previousYear")}
          className="h-11 w-11 items-center justify-center rounded-full"
          onPress={() => {
            hidePopover()
            setYear((value) => value - 1)
          }}
        >
          <MaterialIcons
            name="chevron-left"
            size={24}
            color={palette.textMuted}
          />
        </Pressable>
        <Text
          className="min-w-20 text-center text-base font-bold"
          style={{ color: palette.text }}
        >
          {t("home.readingStats.year", { year })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("home.readingStats.nextYear")}
          accessibilityState={{ disabled: year >= currentYear }}
          className="h-11 w-11 items-center justify-center rounded-full"
          disabled={year >= currentYear}
          onPress={() => {
            hidePopover()
            setYear((value) => Math.min(currentYear, value + 1))
          }}
        >
          <MaterialIcons
            name="chevron-right"
            size={24}
            color={
              year >= currentYear ? palette.borderStrong : palette.textMuted
            }
          />
        </Pressable>
      </View>

      <View testID="reading-statistics-heatmap" className="w-full flex-row">
        <View
          className="shrink-0 items-end pr-1"
          style={{ paddingTop: MONTH_LABEL_HEIGHT }}
        >
          {[
            "",
            t("home.readingStats.weekdays.mon"),
            "",
            t("home.readingStats.weekdays.wed"),
            "",
            t("home.readingStats.weekdays.fri"),
            "",
          ].map((label, index) => (
            <View
              key={`${index}-${label}`}
              className="justify-center"
              style={{ height: CELL_STEP }}
            >
              <Text className="text-base" style={{ color: palette.textMuted }}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView
          key={year}
          ref={heatmapScrollRef}
          testID="reading-statistics-heatmap-scroll"
          className="min-w-0 flex-1"
          horizontal
          nestedScrollEnabled
          scrollEnabled={!isScrubbing}
          showsHorizontalScrollIndicator={false}
          onLayout={handleHeatmapLayout}
          onContentSizeChange={() =>
            scrollToTargetDay(heatmapViewportWidthRef.current)
          }
          onScrollBeginDrag={hidePopover}
        >
          <View style={{ width: heatmapWidth }}>
            <View
              className="relative"
              style={{ height: MONTH_LABEL_HEIGHT, width: heatmapWidth }}
            >
              {monthMarkers.map((marker) => (
                <Text
                  key={marker.key}
                  className="absolute text-base"
                  numberOfLines={1}
                  style={{
                    color: palette.textMuted,
                    left: marker.column * CELL_STEP,
                  }}
                >
                  {marker.label}
                </Text>
              ))}
            </View>

            <View className="relative">
              <HeatmapCells
                backgroundColor={palette.backgroundSecondary}
                cancelable={!isScrubbing}
                dayFormatter={dayFormatter}
                days={days}
                onPressIn={startDayScrub}
                onPressMove={moveDayScrub}
                onTouchEnd={hidePopover}
                primaryColor={palette.primary}
                t={t}
                todayKey={todayKey}
                weeks={weeks}
              />
              {popover ? (
                <View
                  pointerEvents="none"
                  className="absolute rounded-sm border"
                  style={{
                    borderColor: palette.text,
                    height: CELL_SIZE,
                    left: popover.column * CELL_STEP,
                    top: popover.row * CELL_STEP,
                    width: CELL_SIZE,
                  }}
                />
              ) : null}
            </View>
          </View>
        </ScrollView>
      </View>

      <Modal
        transparent
        visible={popover !== null}
        animationType="none"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={hidePopover}
      >
        <View pointerEvents="none" className="absolute inset-0">
          {popover ? (
            <View
              testID="reading-statistics-popover"
              className="absolute items-center justify-center rounded-md px-3 shadow-md"
              style={{
                backgroundColor: palette.text,
                height: POPOVER_HEIGHT,
                left: popoverLeft,
                top: popoverTop,
                width: POPOVER_WIDTH,
              }}
            >
              <Text
                accessibilityLiveRegion="polite"
                className="text-base"
                numberOfLines={1}
                style={{ color: palette.background }}
              >
                {feedback}
              </Text>
              <View
                className="absolute"
                style={{
                  borderLeftColor: "transparent",
                  borderLeftWidth: POPOVER_ARROW_SIZE,
                  borderRightColor: "transparent",
                  borderRightWidth: POPOVER_ARROW_SIZE,
                  borderTopColor: showPopoverAbove
                    ? palette.text
                    : "transparent",
                  borderTopWidth: showPopoverAbove ? POPOVER_ARROW_SIZE : 0,
                  borderBottomColor: showPopoverAbove
                    ? "transparent"
                    : palette.text,
                  borderBottomWidth: showPopoverAbove ? 0 : POPOVER_ARROW_SIZE,
                  left: popoverArrowLeft,
                  top: showPopoverAbove ? POPOVER_HEIGHT : -POPOVER_ARROW_SIZE,
                }}
              />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  )
}
