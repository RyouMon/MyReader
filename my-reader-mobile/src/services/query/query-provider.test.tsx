import AsyncStorage from "@react-native-async-storage/async-storage"
import { dehydrate, QueryClient, useQuery } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react-native"
import { Text } from "react-native"

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}))

it.each([
  false,
  true,
])("revalidates a deleted book's fresh disk cache when the catalog mounts during restoration: %s", async (mountDuringRestore) => {
  jest.clearAllMocks()
  const key = ["books", "library"]
  const deletedBooks = [{ id: "1", title: "Deleted book" }]
  const previousClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  })
  previousClient.setQueryData(key, deletedBooks)
  const persisted = JSON.stringify({
    buster: "",
    timestamp: Date.now(),
    clientState: dehydrate(previousClient),
  })
  let finishRestore!: (value: string) => void
  jest.mocked(AsyncStorage.getItem).mockReturnValue(
    new Promise((resolve) => {
      finishRestore = resolve
    }),
  )
  const { QueryProvider } = require("./query-provider")
  const { queryClient } = require("./query-client")
  const readCatalog = jest.fn(async () => [])
  function Catalog() {
    const { data } = useQuery({ queryKey: key, queryFn: readCatalog })
    return (
      <Text>
        {data?.length === 0 ? "Empty library" : "Cached deleted book"}
      </Text>
    )
  }

  const view = render(
    <QueryProvider>{mountDuringRestore && <Catalog />}</QueryProvider>,
  )
  try {
    expect(readCatalog).not.toHaveBeenCalled()
    await act(async () => {
      finishRestore(persisted)
    })
    if (!mountDuringRestore) {
      await waitFor(() =>
        expect(queryClient.getQueryData(key)).toEqual(deletedBooks),
      )
      view.rerender(
        <QueryProvider>
          <Catalog />
        </QueryProvider>,
      )
    }
    await waitFor(() => expect(screen.getByText("Empty library")).toBeTruthy())
    expect(readCatalog).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(key)).toEqual([])
  } finally {
    view.unmount()
    queryClient.clear()
    previousClient.clear()
  }
})
