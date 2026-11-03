import { expect, it } from "vitest"
import { appendLlmProgress } from "../src/llm-progress"

it("accumulates output while resetting at request and reasoning boundaries", () => {
  let progress = appendLlmProgress(
    { kind: "", text: "" },
    { kind: "reasoning", delta: "核对" },
  )
  progress = appendLlmProgress(progress, { kind: "reasoning", delta: "人物" })
  expect(progress.text).toBe("核对人物")
  progress = appendLlmProgress(progress, { kind: "text", delta: "结果" })
  expect(progress.text).toBe("结果")
  expect(appendLlmProgress(progress, { kind: "started" }).text).toBe("")
})

it("bounds the displayed tail without breaking Unicode characters", () => {
  const progress = appendLlmProgress(
    { kind: "text", text: "旧内容" },
    { kind: "text", delta: "真昼😀".repeat(1000) },
  )
  expect(Array.from(progress.text)).toHaveLength(2048)
  expect(progress.text.endsWith("真昼😀")).toBe(true)
  expect(progress.text).not.toContain("旧内容")
})
