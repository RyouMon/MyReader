import { useEffect, useMemo } from "react"
import { StyleSheet, View, type ViewProps } from "react-native"
import Reanimated, {
  Easing,
  cancelAnimation,
  makeMutable,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated"

type SkeletonProps = ViewProps & {
  animated?: boolean
  pulseDurationMs?: number
  pulseMaxOpacity?: number
  pulseMinOpacity?: number
  pulseSyncKey?: string
}

type SyncedPulse = {
  activeCount: number
  durationMs: number
  maxOpacity: number
  minOpacity: number
  opacity: SharedValue<number>
}

const syncedPulses = new Map<string, SyncedPulse>()

function getSyncedPulse(key: string, initialOpacity: number): SyncedPulse {
  let pulse = syncedPulses.get(key)
  if (pulse) return pulse

  pulse = {
    activeCount: 0,
    durationMs: 0,
    maxOpacity: initialOpacity,
    minOpacity: initialOpacity,
    opacity: makeMutable(initialOpacity),
  }
  syncedPulses.set(key, pulse)
  return pulse
}

function startSyncedPulse(
  pulse: SyncedPulse,
  {
    maxOpacity,
    minOpacity,
    pulseDurationMs,
  }: {
    maxOpacity: number
    minOpacity: number
    pulseDurationMs: number
  },
): void {
  const paramsChanged =
    pulse.durationMs !== pulseDurationMs ||
    pulse.maxOpacity !== maxOpacity ||
    pulse.minOpacity !== minOpacity

  pulse.activeCount += 1
  if (pulse.activeCount > 1 && !paramsChanged) {
    return
  }

  pulse.durationMs = pulseDurationMs
  pulse.maxOpacity = maxOpacity
  pulse.minOpacity = minOpacity
  cancelAnimation(pulse.opacity)
  pulse.opacity.value = maxOpacity
  pulse.opacity.value = withRepeat(
    withSequence(
      withTiming(minOpacity, {
        duration: pulseDurationMs,
        easing: Easing.inOut(Easing.ease),
      }),
      withTiming(maxOpacity, {
        duration: pulseDurationMs,
        easing: Easing.inOut(Easing.ease),
      }),
    ),
    -1,
    false,
  )
}

function stopSyncedPulse(key: string, pulse: SyncedPulse): void {
  pulse.activeCount = Math.max(0, pulse.activeCount - 1)
  if (pulse.activeCount > 0) {
    return
  }

  cancelAnimation(pulse.opacity)
  pulse.opacity.value = pulse.maxOpacity
  syncedPulses.delete(key)
}

export function resetSkeletonPulseSyncForTests(): void {
  for (const pulse of syncedPulses.values()) {
    cancelAnimation(pulse.opacity)
  }
  syncedPulses.clear()
}

/**
 * React Native Reusables-style loading placeholder.
 *
 * The opacity pulse runs on Reanimated's UI thread. Keep it configurable
 * because cover loading skeletons appear inside recycled FlashList cells and
 * must be easy to disable when profiling scroll cost. `pulseSyncKey` shares
 * one pulse clock across recycled placeholders so late-mounted cells join the
 * same phase instead of starting their own repeat.
 */
export function Skeleton({
  animated = false,
  pulseDurationMs = 750,
  pulseMaxOpacity = 1,
  pulseMinOpacity = 0.4,
  pulseSyncKey,
  style,
  ...props
}: SkeletonProps) {
  const syncedPulse = useMemo(
    () =>
      pulseSyncKey && animated
        ? getSyncedPulse(pulseSyncKey, pulseMaxOpacity)
        : undefined,
    [animated, pulseMaxOpacity, pulseSyncKey],
  )
  const localOpacity = useSharedValue(pulseMaxOpacity)
  const opacity = syncedPulse?.opacity ?? localOpacity
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  useEffect(() => {
    if (!animated) {
      cancelAnimation(localOpacity)
      localOpacity.value = pulseMaxOpacity
      return
    }

    if (syncedPulse && pulseSyncKey) {
      startSyncedPulse(syncedPulse, {
        maxOpacity: pulseMaxOpacity,
        minOpacity: pulseMinOpacity,
        pulseDurationMs,
      })
      return () => stopSyncedPulse(pulseSyncKey, syncedPulse)
    }

    localOpacity.value = withRepeat(
      withSequence(
        withTiming(pulseMinOpacity, {
          duration: pulseDurationMs,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(pulseMaxOpacity, {
          duration: pulseDurationMs,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      false,
    )

    return () => {
      cancelAnimation(localOpacity)
    }
  }, [
    animated,
    localOpacity,
    pulseDurationMs,
    pulseMaxOpacity,
    pulseMinOpacity,
    pulseSyncKey,
    syncedPulse,
  ])

  if (animated) {
    return (
      <Reanimated.View {...props} style={[styles.root, style, animatedStyle]} />
    )
  }

  return (
    <View
      {...props}
      style={[styles.root, style, { opacity: pulseMinOpacity }]}
    />
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "rgba(122, 107, 93, 0.18)",
    borderRadius: 6,
  },
})
