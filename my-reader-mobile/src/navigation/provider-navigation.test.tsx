import { router, Stack } from "expo-router"
import { act, renderRouter, screen } from "expo-router/testing-library"
import { Text } from "react-native"

import * as LlmProvidersLayout from "@/src/app/llm-providers/_layout"
import * as TtsProvidersLayout from "@/src/app/tts-providers/_layout"

jest.mock("@/src/navigation/hooks/use-stack-screen-options", () => ({
  useStackScreenOptions: () => ({ headerShown: false }),
}))

function renderNavigation(initialUrl: string) {
  return renderRouter(
    {
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      index: () => <Text>Settings</Text>,
      "llm-providers/_layout": LlmProvidersLayout,
      "llm-providers/index": () => <Text>LLM providers</Text>,
      "llm-providers/form": () => <Text>LLM form</Text>,
      "tts-providers/_layout": TtsProvidersLayout,
      "tts-providers/index": () => <Text>TTS providers</Text>,
      "tts-providers/form": () => <Text>TTS form</Text>,
      "tts-providers/profile": () => <Text>TTS profile</Text>,
    },
    { initialUrl },
  )
}

describe.each(["llm", "tts"] as const)("%s provider navigation", (kind) => {
  it("returns from editing to the provider list before leaving settings", () => {
    const navigation = renderNavigation("/")
    act(() => router.push(`/${kind}-providers`))
    act(() => router.push(`/${kind}-providers/form`))
    expect(screen.getByText(`${kind.toUpperCase()} form`)).toBeTruthy()
    act(() => router.back())
    expect(navigation.getPathname()).toBe(`/${kind}-providers`)
    expect(screen.getByText(`${kind.toUpperCase()} providers`)).toBeTruthy()
    act(() => router.back())
    expect(navigation.getPathname()).toBe("/")
    expect(screen.getByText("Settings")).toBeTruthy()
  })

  it("keeps the provider list as the back destination when opening a form directly", () => {
    const navigation = renderNavigation(`/${kind}-providers/form`)
    expect(router.canGoBack()).toBe(true)
    act(() => router.back())
    expect(navigation.getPathname()).toBe(`/${kind}-providers`)
    expect(screen.getByText(`${kind.toUpperCase()} providers`)).toBeTruthy()
  })
})
