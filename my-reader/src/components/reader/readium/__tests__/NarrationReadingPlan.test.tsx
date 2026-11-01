import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { NarrationReadingPlan } from "../NarrationReadingPlan"
import type { ReadingPlanController } from "@/hooks/reader/use-reading-plan"

vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@tanstack/react-virtual")>()
  return {
    ...original,
    useVirtualizer: (options: Parameters<typeof original.useVirtualizer>[0]) =>
      original.useVirtualizer({
        ...options,
        observeElementRect: (_, callback) => {
          callback({ width: 360, height: 500 })
        },
        observeElementOffset: (_, callback) => {
          callback(0, false)
        },
        scrollToFn: vi.fn(),
      }),
  }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("reading plan management", () => {
  it("plays an entry without jumping and clears selected synthesis requests", async () => {
    const plan = {
      entries: [1, 2].map((id) => ({
        id: String(id),
        sourceKey: "{}",
        position: id / 10,
        characterId: "person",
        characterName: "小明",
        speech: {
          text: `Passage ${id}`,
          instructions: "温柔",
          startUtf16: 0,
          endUtf16: 9,
          voice: { engine: "system", voiceId: "a" },
        },
      })),
      currentIndex: 0,
      shown: false,
      setShown: vi.fn(),
      busy: false,
      analyzing: false,
      error: null,
      ensureChapter: vi.fn(),
      cancel: vi.fn(),
      analyze: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
      play: vi.fn(),
      jump: vi.fn(),
    } as unknown as ReadingPlanController
    render(<NarrationReadingPlan plan={plan} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText("Passage 2"))
    expect(plan.play).toHaveBeenCalledWith("2")
    expect(plan.jump).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("switch"))
    expect(plan.setShown).toHaveBeenCalledWith(true)
    expect(plan.analyze).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole("button", { name: "narration.plan.select" }),
    )
    fireEvent.click(screen.getByRole("button", { name: "common.selectAll" }))
    fireEvent.click(
      screen.getByRole("button", { name: "narration.plan.clearSelected" }),
    )
    expect(plan.clear).toHaveBeenCalledWith(["1", "2"])
  })
})
