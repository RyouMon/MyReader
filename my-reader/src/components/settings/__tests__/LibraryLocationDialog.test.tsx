import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { open } from "@tauri-apps/plugin-dialog"
import { beforeEach, expect, it, vi } from "vitest"
import i18n from "@/i18n"
import { api } from "@/lib/tauri-api"
import {
  LibraryLocationDialog,
  LibraryLocationFailure,
} from "../LibraryLocationDialog"

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/settings?section=dataSources">{children}</a>
  ),
}))
vi.mock("@/lib/tauri-api", () => ({
  api: {
    getLibraryLocation: vi.fn(),
    relocateLibrary: vi.fn(),
    webdavListFolders: vi.fn(),
    onedriveListFolders: vi.fn(),
    syncDbForLibrary: vi.fn(),
  },
}))
const library = {
  id: "books",
  name: "Books",
  path: "/old",
  bookCount: 2,
  sourceType: "local",
  libraryType: "myreader" as const,
}
const location = {
  libraryId: "books",
  libraryName: "Books",
  dataSourceId: null,
  dataSourceName: null,
  sourceRoot: "",
  path: "/old",
  effectivePath: "/old",
  canRelocate: true,
  problem: "root_missing",
  detail: "ENOENT /old",
}
function mount(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidate = vi.spyOn(client, "invalidateQueries")
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
  return invalidate
}
beforeEach(async () => {
  vi.resetAllMocks()
  await i18n.changeLanguage("en")
  vi.mocked(api.getLibraryLocation).mockResolvedValue(location)
  vi.mocked(api.relocateLibrary).mockResolvedValue({
    ...location,
    path: "/new",
    effectivePath: "/new",
    problem: null,
    detail: null,
  })
  vi.mocked(api.webdavListFolders).mockResolvedValue([])
  vi.mocked(api.onedriveListFolders).mockResolvedValue([])
})
it("preserves the existing location when the native picker is cancelled", async () => {
  vi.mocked(open).mockResolvedValue(null)
  const close = vi.fn()
  mount(<LibraryLocationDialog library={library} open onOpenChange={close} />)
  fireEvent.click(await screen.findByRole("button", { name: "Choose folder" }))
  await waitFor(() => expect(open).toHaveBeenCalled())
  expect(api.relocateLibrary).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(close).toHaveBeenCalledWith(false)
})
it("validates a selected local folder, invalidates cached location and retries sync", async () => {
  vi.mocked(open).mockResolvedValue("/new")
  const invalidate = mount(
    <LibraryLocationDialog library={library} open onOpenChange={vi.fn()} />,
  )
  fireEvent.click(await screen.findByRole("button", { name: "Choose folder" }))
  fireEvent.click(
    await screen.findByRole("button", { name: "Validate and save" }),
  )
  expect(
    await screen.findByText("Location saved. You can sync now."),
  ).toBeInTheDocument()
  expect(api.relocateLibrary).toHaveBeenCalledWith("books", "/new")
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ["libraryLocation", "books"],
  })
  fireEvent.click(screen.getByRole("button", { name: "Sync now" }))
  await waitFor(() =>
    expect(api.syncDbForLibrary).toHaveBeenCalledWith("books"),
  )
})
it.each([
  "webdav",
  "onedrive",
])("browses and repairs the existing %s library", async (sourceType) => {
  vi.mocked(api.getLibraryLocation).mockResolvedValue({
    ...location,
    dataSourceId: "source",
    dataSourceName: "Shelf",
    sourceRoot: "/base",
    effectivePath: "https://server/dav/base/old",
    problem: "path_unavailable",
  })
  const list =
    sourceType === "webdav" ? api.webdavListFolders : api.onedriveListFolders
  vi.mocked(list).mockResolvedValue([{ name: "Moved", path: "/new" }])
  mount(
    <LibraryLocationDialog
      library={{
        ...library,
        dataSourceId: "source",
        sourceType,
        sourcePath: "/old",
      }}
      open
      onOpenChange={vi.fn()}
    />,
  )
  fireEvent.click(await screen.findByRole("button", { name: "Choose folder" }))
  fireEvent.click(await screen.findByText("Moved"))
  await waitFor(() => expect(list).toHaveBeenCalledWith("source", "/new"))
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Validate and save" }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole("button", { name: "Validate and save" }))
  expect(
    await screen.findByText("Location saved. You can sync now."),
  ).toBeInTheDocument()
  expect(api.relocateLibrary).toHaveBeenCalledWith("books", "/new")
})
it("keeps validation failures visible and never offers sync for a different identity", async () => {
  vi.mocked(open).mockResolvedValue("/different")
  vi.mocked(api.relocateLibrary).mockResolvedValue({
    ...location,
    problem: "identity_mismatch",
  })
  mount(<LibraryLocationDialog library={library} open onOpenChange={vi.fn()} />)
  fireEvent.click(await screen.findByRole("button", { name: "Choose folder" }))
  fireEvent.click(
    await screen.findByRole("button", { name: "Validate and save" }),
  )
  expect(
    await screen.findByText(/This is a different library/),
  ).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull()
})
it("keeps the dialog open while saving and reports retry failures", async () => {
  vi.mocked(open).mockResolvedValue("/new")
  let complete!: (value: typeof location) => void
  vi.mocked(api.relocateLibrary).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  vi.mocked(api.syncDbForLibrary).mockRejectedValue(new Error("offline"))
  mount(<LibraryLocationDialog library={library} open onOpenChange={vi.fn()} />)
  fireEvent.click(await screen.findByRole("button", { name: "Choose folder" }))
  fireEvent.click(
    await screen.findByRole("button", { name: "Validate and save" }),
  )
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled(),
  )
  await act(async () =>
    complete({ ...location, problem: null } as unknown as typeof location),
  )
  fireEvent.click(await screen.findByRole("button", { name: "Sync now" }))
  expect(await screen.findByText("Error: offline")).toBeInTheDocument()
})
it("opens repair from the failure notice and links invalid data sources to settings", async () => {
  vi.mocked(api.getLibraryLocation).mockResolvedValue({
    ...location,
    problem: "data_source",
    dataSourceId: "source",
  })
  mount(<LibraryLocationFailure library={library} />)
  expect(
    await screen.findByRole("link", { name: "Data source settings" }),
  ).toHaveAttribute("href", "/settings?section=dataSources")
  fireEvent.click(
    screen.getByRole("button", { name: "Change library location" }),
  )
  expect(await screen.findByRole("dialog")).toBeInTheDocument()
})
it("does not offer location changes for app-managed storage", async () => {
  vi.mocked(api.getLibraryLocation).mockResolvedValue({
    ...location,
    canRelocate: false,
  })
  mount(<LibraryLocationFailure library={library} />)
  await screen.findByText("Library folder not found")
  expect(
    screen.queryByRole("button", { name: "Change library location" }),
  ).toBeNull()
})
