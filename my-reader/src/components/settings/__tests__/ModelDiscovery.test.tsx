import "@/i18n"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ModelDiscovery } from "../ModelDiscovery"

describe("ModelDiscovery", () => {
  it("renders in a dedicated dialog, distinguishes already-added models, and submits selected IDs", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const onClose = vi.fn()
    render(
      <ModelDiscovery
        models={[{ id: "existing-model" }, { id: "new-a" }, { id: "new-b" }]}
        existing={["existing-model"]}
        onAdd={onAdd}
        onClose={onClose}
      />,
    )

    const dialog = screen.getByRole("dialog", { name: "选择可用模型" })
    expect(within(dialog).queryByLabelText("搜索模型")).not.toBeInTheDocument()
    expect(
      within(dialog).queryByRole("checkbox", { name: "existing-model" }),
    ).not.toBeInTheDocument()
    expect(within(dialog).getByText("existing-model")).toBeInTheDocument()
    expect(within(dialog).getByText("已添加")).toBeInTheDocument()

    const addButton = within(dialog).getByRole("button", {
      name: "添加所选模型",
    })
    expect(addButton).toBeDisabled()

    await user.click(within(dialog).getByRole("button", { name: "全选" }))
    expect(within(dialog).getByText("已选 2 项")).toBeInTheDocument()
    expect(addButton).toBeEnabled()

    await user.click(within(dialog).getByRole("button", { name: "取消全选" }))
    expect(addButton).toBeDisabled()

    await user.click(within(dialog).getByRole("checkbox", { name: "new-a" }))
    await user.click(within(dialog).getByRole("checkbox", { name: "new-b" }))
    expect(within(dialog).getByText("已选 2 项")).toBeInTheDocument()
    expect(
      within(dialog).getByRole("button", { name: "取消全选" }),
    ).toBeInTheDocument()
    expect(addButton).toBeEnabled()

    await user.click(addButton)
    expect(onAdd).toHaveBeenCalledWith(["new-a", "new-b"])

    await user.click(within(dialog).getByRole("button", { name: "取消" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("shows search for large catalogs, preserves selections across filters, and handles empty matches", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const models = Array.from({ length: 9 }, (_, i) => ({
      id: i === 0 ? "speech-hd" : `model-${i}`,
    }))
    render(
      <ModelDiscovery
        models={models}
        existing={[]}
        onAdd={onAdd}
        onClose={vi.fn()}
      />,
    )

    const dialog = screen.getByRole("dialog", { name: "选择可用模型" })
    const search = within(dialog).getByLabelText("搜索模型")

    await user.click(
      within(dialog).getByRole("checkbox", { name: "speech-hd" }),
    )
    await user.type(search, "model-8")
    expect(
      within(dialog).queryByRole("checkbox", { name: "speech-hd" }),
    ).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("checkbox", { name: "model-8" }))
    expect(within(dialog).getByText("已选 2 项")).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, "model-1")
    await user.click(within(dialog).getByRole("button", { name: "全选" }))
    expect(within(dialog).getByText("已选 3 项")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "取消全选" }))
    expect(within(dialog).getByText("已选 2 项")).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, "nonexistent")
    expect(within(dialog).getByText("没有匹配的模型")).toBeInTheDocument()
    expect(
      within(dialog).queryByRole("button", { name: "全选" }),
    ).not.toBeInTheDocument()

    await user.click(
      within(dialog).getByRole("button", { name: "添加所选模型" }),
    )
    expect(onAdd).toHaveBeenCalledWith(["speech-hd", "model-8"])
  })

  it("shows empty notice when every discovered model is already configured", () => {
    render(
      <ModelDiscovery
        models={[{ id: "only-model" }]}
        existing={["only-model"]}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText("可用模型均已添加")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "全选" }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "添加所选模型" })).toBeDisabled()
  })
})
