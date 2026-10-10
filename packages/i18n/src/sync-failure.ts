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

/** Keep diagnostics verbatim after the localized guidance, including legacy messages. */
export function syncFailureDetail(
  detail: string,
  failure: { failureKind?: string; message?: string } | undefined,
): string {
  const diagnostic = [failure?.failureKind, failure?.message]
    .filter(Boolean)
    .join(": ")
  return diagnostic ? `${detail}\n\n${diagnostic}` : detail
}
