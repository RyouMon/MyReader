import type { Locator, Utterance } from "@my-reader/readium"
import { narrationTextContext } from "./narration-text-context"

const locator: Locator = {
  href: "chapter.xhtml",
  type: "application/xhtml+xml",
}
const paragraph = (text: string, progression = 0): Utterance => ({
  text,
  locator: { ...locator, locations: { progression } },
})

it("provides neighboring paragraphs for the opening dialogue without speaking them", () => {
  const text = "「我不是小孩子了」"
  const context = narrationTextContext(
    [
      paragraph("第一章"),
      paragraph(text),
      paragraph("周无奈地回答母亲的电话。"),
      {
        ...paragraph("另一个故事"),
        locator: { ...locator, href: "other.xhtml" },
      },
    ],
    { ...locator, text: { before: "第一章", after: "\n" } },
    text,
  )
  expect(context.before).toBe("第一章\n")
  expect(context.after).toBe("\n周无奈地回答母亲的电话。")
  expect(context.after).not.toContain(text)
})

it("uses the locator to distinguish repeated dialogue in the same chapter", () => {
  const context = narrationTextContext(
    [
      paragraph("「嗯」", 0.1),
      paragraph("周离开了。", 0.3),
      paragraph("「嗯」", 0.8),
      paragraph("真昼点了点头。", 0.9),
    ],
    { ...locator, locations: { progression: 0.8 } },
    "「嗯」",
  )
  expect(context.before).toBe("「嗯」\n周离开了。\n")
  expect(context.after).toBe("\n真昼点了点头。")
})

it("does not guess a passage when identical text has no distinguishing location", () => {
  const fallback = { before: "", after: "" }
  expect(
    narrationTextContext(
      [paragraph("「嗯」"), paragraph("「嗯」")],
      locator,
      "「嗯」",
    ),
  ).toEqual(fallback)
  expect(
    narrationTextContext([paragraph("其他文字")], locator, "「嗯」"),
  ).toEqual(fallback)
})

it("limits each side of context without splitting Unicode characters", () => {
  const context = narrationTextContext(
    [
      paragraph("😀".repeat(1000)),
      paragraph("对白"),
      paragraph("😺".repeat(1000)),
    ],
    locator,
    "对白",
  )
  expect(context.before).toBe("😀".repeat(899) + "\n")
  expect(context.after).toBe("\n" + "😺".repeat(899))
})

it("includes the rest of a paragraph around a sentence and respects its text anchor", () => {
  expect(
    narrationTextContext(
      [paragraph("她问：好吗？他回答：好吗？")],
      { ...locator, text: { before: "她问：好吗？他回答：" } },
      "好吗？",
    ),
  ).toEqual({ before: "她问：好吗？他回答：", after: "" })
})
