import { router } from "expo-router"
import { act, renderRouter, screen } from "expo-router/testing-library"
import { Text as MockText } from "react-native"
import * as AddSourceLayout from "@/src/app/settings/source-type/_layout"
import AddSourceRoute from "@/src/app/settings/source-type/[type]"

jest.mock("@/src/navigation/hooks/use-stack-screen-options", () => ({
  useStackScreenOptions: () => ({ headerShown: false }),
}))

jest.mock("@/src/features/cloud/cloud-add-data-source-screen", () => ({
  CloudAddDataSourceScreen: ({ provider }: { provider: string }) => (
    <MockText>{provider} form</MockText>
  ),
}))
jest.mock("@/src/features/onedrive/onedrive-add-data-source-screen", () => ({
  __esModule: true,
  default: () => <MockText>onedrive form</MockText>,
}))
jest.mock("@/src/features/webdav/add-webdav-data-source-screen", () => ({
  __esModule: true,
  default: () => <MockText>webdav form</MockText>,
}))

const routes = {
  "settings/data-sources": () => <MockText>Manage sources</MockText>,
  "settings/source-type/_layout": AddSourceLayout,
  "settings/source-type/index": () => <MockText>Source types</MockText>,
  "settings/source-type/[type]": AddSourceRoute,
}

it.each([
  "webdav",
  "onedrive",
  "gdrive",
  "dropbox",
  "s3",
])("opens the %s form and returns through the picker to the manager", (type) => {
  const navigation = renderRouter(routes, {
    initialUrl: "/settings/data-sources",
  })
  act(() => router.push("/settings/source-type"))
  act(() =>
    router.push({ pathname: "/settings/source-type/[type]", params: { type } }),
  )
  expect(screen.getByText(`${type} form`)).toBeTruthy()
  act(() => router.back())
  expect(screen.getByText("Source types")).toBeTruthy()
  act(() => router.back())
  expect(navigation.getPathname()).toBe("/settings/data-sources")
  expect(screen.getByText("Manage sources")).toBeTruthy()
})

it("keeps the picker as the back destination for a direct link to a form", () => {
  renderRouter(routes, { initialUrl: "/settings/source-type/s3" })
  expect(screen.getByText("s3 form")).toBeTruthy()
  act(() => router.back())
  expect(screen.getByText("Source types")).toBeTruthy()
})

it("recovers an unsupported type link by showing the picker", async () => {
  const navigation = renderRouter(routes, {
    initialUrl: "/settings/source-type/unknown",
  })
  expect(await screen.findByText("Source types")).toBeTruthy()
  expect(navigation.getPathname()).toBe("/settings/source-type")
})
