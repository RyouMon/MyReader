import { describe, expect, it } from "vitest"
import {
  narrationPlanLocator,
  narrationPlanIndex,
  narrationSpeechForText,
  narrationSpeechForEntry,
  narrationSourceKey,
  narrationCharacterColor,
  type ReadingPlanEntry,
} from "../src/narration-plan"

describe("current reading-plan speech", () => {
  const selected = {
    id: "old:2:8",
    sourceKey: "paragraph",
    position: 0,
    characterId: "character",
    characterName: "Name",
    speech: {
      text: "你🙂好，再见",
      startUtf16: 2,
      endUtf16: 9,
      instructions: "old",
      voice: { profileId: "deleted", voiceId: "old" },
    },
  }
  const current = (start: number, end: number, text: string) => ({
    ...selected,
    id: `current:${start}:${end}`,
    speech: {
      text,
      startUtf16: start,
      endUtf16: end,
      instructions: "new",
      voice: { profileId: "current", voiceId: "new" },
    },
  })
  it("uses current voices and instructions across smaller provider chunks", () => {
    const speech = narrationSpeechForEntry(
      [
        current(0, 5, "开头你🙂"),
        current(5, 9, "好，再见"),
        current(9, 10, "。"),
      ],
      selected,
    )
    expect(speech).toEqual([
      { ...current(0, 5, "").speech, text: "你🙂", startUtf16: 0, endUtf16: 3 },
      {
        ...current(5, 9, "").speech,
        text: "好，再见",
        startUtf16: 3,
        endUtf16: 7,
      },
    ])
  })
  it("preserves the selected text when the current provider allows a larger chunk", () => {
    expect(
      narrationSpeechForEntry([current(0, 10, "开头你🙂好，再见。")], selected),
    ).toEqual([
      {
        ...current(0, 10, "").speech,
        text: selected.speech.text,
        startUtf16: 0,
        endUtf16: 7,
      },
    ])
  })
  it("never replays stale speech for a cleared, incomplete or changed source", () => {
    for (const entries of [
      [],
      [current(5, 9, "好，再见")],
      [current(2, 9, "你🙂好，再说")],
      [
        {
          ...current(2, 9, selected.speech.text),
          sourceKey: "other paragraph",
        },
      ],
    ])
      expect(() => narrationSpeechForEntry(entries, selected)).toThrow(
        "NARRATION_PLAN_INVALID",
      )
  })
})

describe("narration source identity", () => {
  const source = {
    href: "chapter.xhtml",
    type: "application/xhtml+xml",
    locations: {
      cssSelector: "#line",
      domRange: {
        start: { cssSelector: "#line", textNodeIndex: 0, charOffset: 5 },
      },
    },
    text: { before: "before", highlight: "你🙂说：你好！", after: "after" },
  }
  const entry: ReadingPlanEntry = {
    id: "one",
    sourceKey: JSON.stringify(source),
    position: 0,
    characterId: "character",
    characterName: "角色",
    speech: {
      startUtf16: 5,
      endUtf16: 8,
      text: "你好！",
      instructions: "温柔",
    },
  }
  it("refines the source quote while retaining its element and surrounding context", () => {
    expect(narrationPlanLocator(entry)).toEqual({
      ...source,
      locations: { cssSelector: "#line" },
      text: { before: "before你🙂说：", highlight: "你好！", after: "after" },
    })
    expect(
      narrationPlanLocator({ ...entry, sourceKey: "not a locator" }),
    ).toBeNull()
    expect(
      narrationPlanLocator({
        ...entry,
        speech: { ...entry.speech, text: "missing" },
      }),
    ).toBeNull()
  })
  it("keeps repeated text at different locations separate", () => {
    const reordered = {
      text: source.text,
      locations: source.locations,
      type: source.type,
      href: source.href,
    }
    expect(narrationSourceKey(source)).toBe(narrationSourceKey(reordered))
    expect(narrationSourceKey(source)).not.toBe(
      narrationSourceKey({ ...source, locations: { cssSelector: "#other" } }),
    )
    expect(narrationCharacterColor("stable-id")).toBe(
      narrationCharacterColor("stable-id"),
    )
  })
  it("maps normalized speech back to original whitespace and Unicode boundaries", () => {
    const locator = { ...source, text: { highlight: "你🙂　　说：你好！" } }
    const result = narrationPlanLocator({
      ...entry,
      sourceKey: JSON.stringify(locator),
      speech: { ...entry.speech, startUtf16: 3, endUtf16: 6, text: " 说：" },
    })
    expect(result?.text?.highlight).toBe("说：")
    expect(result?.text?.before).toBe("你🙂　　")
    expect(
      narrationPlanLocator({
        ...entry,
        sourceKey: JSON.stringify(locator),
        speech: {
          ...entry.speech,
          startUtf16: 0,
          endUtf16: 9,
          text: "你🙂 说：你好！",
        },
      }),
    ).toEqual(locator)
  })
})

it("positions the plan at the current block, including repeated quotes and a mid-paragraph viewport", () => {
  const entries: ReadingPlanEntry[] = [0, 1, 2].map((i) => ({
    id: String(i),
    sourceKey: JSON.stringify({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { cssSelector: `#p${i}`, progression: i / 3 },
      text: { highlight: "同样一句。接着读。" },
    }),
    position: i / 3,
    characterId: "narrator",
    characterName: "旁白",
    speech: {
      text: "同样一句。接着读。",
      startUtf16: 0,
      endUtf16: 9,
      instructions: "",
    },
  }))
  expect(
    narrationPlanIndex(entries, {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { cssSelector: "#p2" },
      text: { highlight: "接着读。" },
    }),
  ).toBe(2)
  expect(
    narrationPlanIndex(entries, {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.4 },
    }),
  ).toBe(1)
  expect(
    narrationPlanIndex(entries, {
      href: "other.xhtml",
      type: "application/xhtml+xml",
    }),
  ).toBe(-1)
})

it("uses surrounding text for one-character viewport anchors with equivalent but differently serialized selectors", () => {
  const entries: ReadingPlanEntry[] = [
    "周走进教室。",
    "周反倒觉得自己受了她太多照顾。",
  ].map((text, index) => ({
    id: String(index),
    sourceKey: JSON.stringify({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        cssSelector: `body > div:nth-of-type(1) > p:nth-of-type(${index + 1})`,
        progression: index / 10,
      },
      text: { highlight: text },
    }),
    position: index / 10,
    characterId: "narrator",
    characterName: "旁白",
    speech: { text, startUtf16: 0, endUtf16: text.length, instructions: "" },
  }))
  expect(
    narrationPlanIndex(entries, {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        cssSelector: "html > body > div > p:nth-of-type(2)",
        progression: 0,
      },
      text: { highlight: "周", after: "反倒觉得自己受了她太多照顾。" },
    }),
  ).toBe(1)
})

it("reuses paragraph annotations at a mid-paragraph start without repeating or dropping text", () => {
  const speech = [
    { text: "旁白。她说：", startUtf16: 0, endUtf16: 6, voice: "narrator" },
    { text: "你好🙂。", startUtf16: 6, endUtf16: 11, voice: "person" },
  ]
  expect(narrationSpeechForText(speech, "她说：你好🙂。")).toEqual([
    { text: "她说：", startUtf16: 0, endUtf16: 3, voice: "narrator" },
    { text: "你好🙂。", startUtf16: 3, endUtf16: 8, voice: "person" },
  ])
  expect(narrationSpeechForText(speech, "你好🙂。")).toEqual([
    { text: "你好🙂。", startUtf16: 0, endUtf16: 5, voice: "person" },
  ])
  expect(() => narrationSpeechForText(speech, "missing")).toThrow(
    "NARRATION_PLAN_INVALID",
  )
})
