import { useLayoutEffect, useMemo } from "react";

import { Gesture } from "react-native-gesture-handler";
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

type UseDetailSwipePagerArgs = {
  width: number;
  currentIndex: number;
  initialIndex: number;
  previousId: string | null;
  nextId: string | null;
  onCommit: (targetId: string) => void;
};

/**
 * Drives the modal detail horizontal swipe pager.
 *
 * Anti-flicker contract — kept here together with `PagerSlot` so the moving
 * parts can be reasoned about as one unit:
 *
 * Settling a swipe couples two updates that live on different threads — the
 * JS-side `currentId` React state, and the UI-side `translateX` offset. If
 * they commit on different frames, the visible slot briefly shows an
 * adjacent page (the just-left current, or the next-of-next), causing a
 * one-frame flash.
 *
 * To avoid that flash, this hook keeps the related state in one place and
 * sequences its updates so a swap is always atomic from the user's
 * perspective:
 *   1. A UI-thread `pageIndex` shared value tracks the current page's
 *      index in `detailOrderIds`. Transform = `-pageIndex * width +
 *      translateX`.
 *   2. Pages are rendered through `PagerSlot` at `left: detailIndex *
 *      width`, so a page's screen position depends only on its bookId and
 *      never on React's prev/current/next reordering.
 *   3. When the settle animation finishes, the worklet runs
 *      `pageIndex ±= 1; translateX = 0` atomically on the UI thread. The
 *      resulting transform is mathematically identical, so nothing
 *      visually moves. Only afterwards does `scheduleOnRN(onCommit, targetId)` notify
 *      React of the new currentId.
 *   4. `useLayoutEffect` resyncs `pageIndex` whenever React-side
 *      `currentIndex` diverges for any other reason (initial mount,
 *      external navigation, data load).
 */
export function useDetailSwipePager({
  width,
  currentIndex,
  initialIndex,
  previousId,
  nextId,
  onCommit,
}: UseDetailSwipePagerArgs) {
  const translateX = useSharedValue(0);
  const pageIndex = useSharedValue(initialIndex);

  useLayoutEffect(() => {
    if (currentIndex < 0) return;
    if (pageIndex.value === currentIndex) return;
    pageIndex.value = currentIndex;
    translateX.value = 0;
  }, [currentIndex, pageIndex, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -pageIndex.get() * width + translateX.get() }],
  }));

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-18, 18])
        .onUpdate((event) => {
          const movingToPrevious = event.translationX > 0;
          const movingToNext = event.translationX < 0;
          if ((movingToPrevious && previousId) || (movingToNext && nextId)) {
            translateX.set(event.translationX);
            return;
          }
          translateX.set(event.translationX * 0.28);
        })
        .onEnd((event) => {
          const distanceThreshold = width * 0.28;
          const velocityThreshold = 620;
          const shouldMoveToPrevious =
            Boolean(previousId) &&
            (event.translationX > distanceThreshold || event.velocityX > velocityThreshold);
          const shouldMoveToNext =
            Boolean(nextId) &&
            (event.translationX < -distanceThreshold || event.velocityX < -velocityThreshold);

          if (shouldMoveToPrevious && previousId) {
            translateX.set(
              withTiming(width, { duration: 180 }, (finished) => {
                if (finished) {
                  pageIndex.value -= 1;
                  translateX.value = 0;
                  scheduleOnRN(onCommit, previousId);
                }
              })
            );
            return;
          }
          if (shouldMoveToNext && nextId) {
            translateX.set(
              withTiming(-width, { duration: 180 }, (finished) => {
                if (finished) {
                  pageIndex.value += 1;
                  translateX.value = 0;
                  scheduleOnRN(onCommit, nextId);
                }
              })
            );
            return;
          }

          translateX.set(
            withSpring(0, {
              damping: 30,
              stiffness: 180,
              overshootClamping: true,
            })
          );
        }),
    [nextId, onCommit, pageIndex, previousId, translateX, width]
  );

  return { gesture, animatedStyle };
}
