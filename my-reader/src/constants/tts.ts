export const TTS_SPEED_OPTIONS = Array.from({ length: 26 }, (_, index) =>
  Number((0.5 + index * 0.1).toFixed(1)),
)

export const TTS_PITCH_OPTIONS = Array.from({ length: 16 }, (_, index) =>
  Number((0.5 + index * 0.1).toFixed(1)),
)
