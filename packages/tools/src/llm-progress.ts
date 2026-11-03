export type LlmProgress = { kind: string; text: string }

/** Keep only the visible tail, resetting between requests and output phases. */
export function appendLlmProgress(
  previous: LlmProgress,
  event: { kind: string; delta?: string },
): LlmProgress {
  if (event.kind === "started") return { kind: event.kind, text: "" }
  const text = previous.kind === event.kind ? previous.text : ""
  return {
    kind: event.kind,
    text: Array.from(text + (event.delta ?? ""))
      .slice(-2048)
      .join(""),
  }
}
