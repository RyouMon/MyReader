# MyReader TTS mini player motion

## Principles

- Keep the mobile TTS trigger anchored at the lower-left corner.
- Keep the lower-right More button in place and independent from TTS.
- Render every transport action as a separate circular outlined button inside a fully rounded glass shell.
- Anchor the desktop TTS trigger to the lower-right Reader Chrome corner and expand it toward the left.
- Never render the current utterance in Reader Chrome; the sentence highlight is the sole reading-position indicator.
- Animate isolated transform and opacity layers instead of repeatedly laying out the reader surface.
- Keep audio state changes immediate; animation must never delay playback or stop.

## Mobile

### Idle to loading

1. Press the lower-left TTS trigger with a `90ms` scale to `0.94`.
2. Commit the final player hit area immediately, but reveal its fully rounded glass background from the left anchor with `scaleX`.
3. Expand for `260ms` with high damping and no visible overshoot.
4. Crossfade the TTS icon into Stop for `120ms`.
5. Reveal Previous, Play/Pause, Next, and TTS Settings with `160ms` opacity and `translateX(-6px)` transitions, staggered by `20ms`.
6. Move the position label up `64px` for `220ms` so it remains visible above the player.
7. Do not move, replace, or resize the More button.

The player expands only to the space before More. The final order is Stop, Previous sentence, Play/Pause, Next sentence, and TTS Settings. All five controls retain independent circular outlines; the outer shell uses its maximum radius.

### Playback states

- `loading`: expand immediately; delay the spinner by `120ms` to avoid a flash on fast local synthesis. Keep Stop and Settings enabled. Disable Previous and Next when navigation is unavailable.
- `playing`: show Pause with the theme accent treatment.
- `paused`: crossfade Pause to Play for `120ms`; retain the sentence highlight.
- `error`: show Retry in the center and a small error marker on TTS Settings. Do not show book text in the player.
- `ended`: use the Stop collapse motion without stop haptics.

### Navigation

- Previous and Next use a `90ms` press response.
- Crossfade the old and new sentence highlights for `160ms`.
- Tapping a sentence selects it, enters loading, and starts reading from that sentence.
- Auto-follow only when the highlighted sentence crosses the inner viewport safe band; scroll for about `240ms`.
- Suspend auto-follow while the user is actively scrolling.

### Stop

1. Stop audio immediately.
2. Clear the sentence highlight for `160ms`.
3. Fade the four revealed controls in reverse order.
4. Contract the glass background to the left trigger for `220ms`.
5. Crossfade Stop back to the TTS icon.
6. Return the position label to its original baseline.

### TTS settings sheet

- Use the platform-native sheet transition.
- Keep playback and player state unchanged behind the sheet.
- Crossfade capability-dependent controls for `160ms` after a provider change.
- Restore focus to TTS Settings when the sheet closes.

### Chrome visibility

- Keep the active player visible when normal Reader Chrome recedes.
- Bookmark, Close, and More retain their existing Chrome visibility behavior.
- Do not widen the player when More is hidden.

## Desktop

- Press feedback lasts `90ms`.
- Keep the idle TTS trigger at the lower-right corner of the complete Reader Chrome, independent from the top action bar.
- Expand the mini player toward the left for `220ms`; keep its right edge fixed throughout the transition.
- Crossfade the fixed rightmost TTS trigger into Stop.
- Reveal Next, Play/Pause, Previous, and TTS Settings from right to left with the same `160ms` staggered treatment as mobile.
- Use the final left-to-right order: TTS Settings, Previous sentence, Play/Pause, Next sentence, Stop.
- Render all five actions as circular outlined buttons inside a fully rounded glass shell.
- Keep the centered book and chapter titles stationary.
- Preserve the active player as a lower-right glass island when the rest of Reader Chrome recedes.
- Use the existing right-side panel transition for TTS Settings without pausing playback.

## Reduced motion and accessibility

- With reduced motion, replace expansion, scale, stagger, and smooth auto-follow with a short opacity change or an immediate state swap.
- Keep keyboard and screen-reader focus on Stop after expansion; restore it to the TTS trigger after collapse.
- Announce loading, playing, paused, stopped, ended, and error states without repeating the book sentence.
- Keep mobile controls at least `44pt` on iOS and `48dp` on Android.
- Use light haptics only for start and stop, and an error notification haptic for failure. Never vibrate on automatic sentence changes.

## Performance constraints

- Run mobile motion on the UI thread through Reanimated.
- Animate a separate glass background layer with transform; do not animate reader layout width on the JS thread.
- Gate newly revealed controls from hit testing until their reveal completes.
- Use a right-anchored FLIP-style transform for desktop expansion so reader content and top-bar actions do not jump.
