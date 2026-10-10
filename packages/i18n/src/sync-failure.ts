/** Choose UI copy from Core's category; old or unknown categories use a safe fallback. */
export function syncFailureKeys(kind?: string | null) {
  const category =
    kind === "connectivity" ||
    kind === "credential" ||
    kind === "configuration" ||
    kind === "data_integrity"
      ? kind
      : "unexpected"
  return {
    title: `syncStatus.failure.${category}.title`,
    detail: `syncStatus.failure.${category}.detail`,
  } as const
}
