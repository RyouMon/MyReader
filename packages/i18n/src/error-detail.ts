function diagnosticText(error: unknown): string | undefined {
  if (typeof error === "string") return error
  if (typeof error !== "object" || error === null) return undefined
  const record = error as Record<string, unknown>
  const type = [record.tag, record.kind, record.name, record.code].find(
    (value) => typeof value === "string" || typeof value === "number",
  )
  const message =
    typeof record.message === "string" ? record.message : undefined
  return [type, message]
    .filter((value) => value !== undefined && value !== "")
    .join(": ")
}

/** UI-only formatting; original categories and messages never select recovery policy. */
export function appendErrorDetail(detail: string, error: unknown): string {
  const diagnostics = new Set<string>()
  const seen = new Set<unknown>()
  let current = error
  while (current != null && !seen.has(current)) {
    seen.add(current)
    const diagnostic = diagnosticText(current)
    if (diagnostic) diagnostics.add(diagnostic)
    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined
  }
  return [detail, ...diagnostics].join("\n")
}
