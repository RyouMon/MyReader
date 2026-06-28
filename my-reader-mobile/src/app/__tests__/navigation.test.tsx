import { Redirect } from "expo-router"
import { renderRouter, screen } from "expo-router/testing-library"
import { Text } from "react-native"

function TabsIndexRoute() {
  return <Redirect href="/home" />
}

function HomeRoute() {
  return <Text>我的阅读</Text>
}

function LibraryRoute() {
  return <Text>书库</Text>
}

function SettingsRoute() {
  return <Text>设置</Text>
}

describe("App navigation smoke", () => {
  it("opens and shows home screen", () => {
    const { getPathname } = renderRouter(
      {
        "(tabs)/index": TabsIndexRoute,
        "(tabs)/home/index": HomeRoute,
        "(tabs)/library/index": LibraryRoute,
        "(tabs)/settings/index": SettingsRoute,
      },
      { initialUrl: "/" },
    )

    expect(getPathname()).toBe("/home")
    expect(screen.getByText("我的阅读")).toBeTruthy()
  })
})
