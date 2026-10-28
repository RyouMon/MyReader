import "@/i18n"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { RowActions } from "../RowActions"

it("edits directly and cancels deletion without changing the record", async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(<RowActions name="示例服务" onEdit={onEdit} onDelete={onDelete} />)
  await user.click(screen.getByRole("button", { name: "编辑 示例服务" }))
  expect(onEdit).toHaveBeenCalledOnce()
  const trigger = screen.getByRole("button", { name: "删除 示例服务" })
  await user.click(trigger)
  const dialog = within(
    screen.getByRole("alertdialog", { name: "删除“示例服务”？" }),
  )
  expect(dialog.getByRole("button", { name: "取消" })).toHaveFocus()
  expect(onDelete).not.toHaveBeenCalled()
  await user.click(dialog.getByRole("button", { name: "取消" }))
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(onDelete).not.toHaveBeenCalled()
})

it("deletes only after confirmation and prevents repeated or dismissed in-flight requests", async () => {
  const user = userEvent.setup()
  let resolve!: () => void
  const onDelete = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  render(<RowActions name="书库" onDelete={onDelete} />)
  await user.click(screen.getByRole("button", { name: "删除 书库" }))
  const dialog = within(screen.getByRole("alertdialog"))
  const confirm = dialog.getByRole("button", { name: "删除" })
  await user.click(confirm)
  expect(confirm).toBeDisabled()
  expect(dialog.getByRole("button", { name: "取消" })).toBeDisabled()
  await user.click(confirm)
  await user.keyboard("{Escape}")
  expect(onDelete).toHaveBeenCalledOnce()
  expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  await act(async () => resolve())
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  )
})

it("keeps a failed deletion open for retry", async () => {
  const user = userEvent.setup()
  const onDelete = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(undefined)
  render(<RowActions name="云盘" onDelete={onDelete} />)
  await user.click(screen.getByRole("button", { name: "删除 云盘" }))
  const dialog = within(screen.getByRole("alertdialog"))
  await user.click(dialog.getByRole("button", { name: "删除" }))
  expect(await dialog.findByRole("alert")).toHaveTextContent("Offline")
  await user.click(dialog.getByRole("button", { name: "删除" }))
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  )
  expect(onDelete).toHaveBeenCalledTimes(2)
})
