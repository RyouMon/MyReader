import "@/i18n"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { useTtsRemovalConfirmation } from "../useTtsRemovalConfirmation"

const usage = vi.hoisted(() => vi.fn())
vi.mock("@/lib/tauri-api", () => ({ api: { getTtsChangeUsage: usage } }))
const remove = vi.fn()
const provider = {
  id: "p",
  kind: "openAiCompatible",
  modelScopedVoices: false,
  models: [],
  voices: [],
}
function Harness() {
  const confirmation = useTtsRemovalConfirmation()
  return (
    <>
      <button
        onClick={async () => {
          if (await confirmation.confirm(provider, "speech")) remove()
        }}
      >
        Remove model
      </button>
      <button onClick={confirmation.reset}>New edit</button>
      {confirmation.dialog}
    </>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  usage.mockResolvedValue([
    {
      profileId: "model",
      libraryName: "小说",
      scopeName: "第一卷",
      bookId: 1,
      characterName: "真昼",
    },
    { profileId: "model", language: "zh" },
  ])
})

it("lists affected settings, cancels without deleting, and remembers only confirmed changes", async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByText("Remove model"))
  expect(await screen.findByRole("alertdialog")).toHaveTextContent(
    "小说 · 第一卷 · 真昼",
  )
  expect(screen.getByRole("alertdialog")).toHaveTextContent("全局朗读设置")
  expect(remove).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "取消" }))
  await user.click(screen.getByText("Remove model"))
  await screen.findByRole("alertdialog")
  await user.click(screen.getByRole("button", { name: "确认" }))
  await waitFor(() => expect(remove).toHaveBeenCalledTimes(1))
  await user.click(screen.getByText("Remove model"))
  await waitFor(() => expect(remove).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole("alertdialog")).toBeNull()
  await user.click(screen.getByText("New edit"))
  await user.click(screen.getByText("Remove model"))
  await screen.findByRole("alertdialog")
  expect(remove).toHaveBeenCalledTimes(2)
})

it("deletes unused models without a warning but blocks deletion if usage cannot be checked", async () => {
  usage.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("Offline"))
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByText("Remove model"))
  await waitFor(() => expect(remove).toHaveBeenCalledTimes(1))
  await user.click(screen.getByText("Remove model"))
  await screen.findByRole("alertdialog")
  expect(remove).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("button", { name: "确认" })).toBeNull()
})
