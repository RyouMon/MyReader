import { relocateLibrary } from "./relocate-library"
import { relocateLibraryLocation } from "@/src/services/core/library/location"
import { announceLocalSidecarWork } from "@/src/services/core/sync-events"
import { queryClient } from "@/src/services/query/query-client"

const mockSetLibraries = jest.fn()
const mockState = {
  activeLibraryId: "lib",
  dataSources: [{ id: "dav" }],
  setLibraries: mockSetLibraries,
}
jest.mock("@/src/store/app-store", () => ({
  useAppStore: { getState: () => mockState },
}))
jest.mock("@/src/services/core/library/location", () => ({
  relocateLibraryLocation: jest.fn(),
}))
jest.mock("@/src/services/core/sync-events", () => ({
  announceLocalSidecarWork: jest.fn(),
}))
jest.mock("@/src/services/query/query-client", () => ({
  queryClient: { invalidateQueries: jest.fn(() => Promise.resolve()) },
}))
const library = {
  id: "lib",
  name: "Books",
  path: "file:///cache",
  bookCount: 1,
  dataSourceId: "dav",
}
beforeEach(() => jest.clearAllMocks())
it("applies only a successful repair and wakes automatic sync without switching the library", async () => {
  const updated = { ...library, sourcePath: "/new" }
  jest.mocked(relocateLibraryLocation).mockResolvedValue({
    config: { libraries: [updated] },
    location: { problem: undefined },
  } as never)
  await relocateLibrary(library, "/new")
  expect(mockSetLibraries).toHaveBeenCalledWith([updated])
  expect(mockState.activeLibraryId).toBe("lib")
  expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["books", "lib"],
  })
  expect(announceLocalSidecarWork).toHaveBeenCalledWith("lib", {
    required: true,
    locationChanged: true,
  })
})
it("leaves UI data and scheduling unchanged after failed validation", async () => {
  jest
    .mocked(relocateLibraryLocation)
    .mockResolvedValue({ location: { problem: "identity_mismatch" } } as never)
  expect(await relocateLibrary(library, "/different")).toEqual({
    problem: "identity_mismatch",
  })
  expect(mockSetLibraries).not.toHaveBeenCalled()
  expect(announceLocalSidecarWork).not.toHaveBeenCalled()
})
