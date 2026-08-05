import { fireEvent, render, screen } from "@testing-library/react-native"
import { router } from "expo-router"
import * as mockReact from "react"
import {
  Pressable as mockPressable,
  Text as mockText,
  View as mockView,
} from "react-native"

import { NoLibraryEmptyState } from "./no-library-empty-state"

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("@/src/components", () => ({
  EmptyState: ({
    action,
    detail,
    title,
  }: {
    action: mockReact.ReactNode
    detail: string
    title: string
  }) =>
    mockReact.createElement(
      mockView,
      null,
      mockReact.createElement(mockText, null, title),
      mockReact.createElement(mockText, null, detail),
      action,
    ),
  PrimaryButton: ({ onPress, title }: { onPress: () => void; title: string }) =>
    mockReact.createElement(
      mockPressable,
      { accessibilityRole: "button", onPress },
      mockReact.createElement(mockText, null, title),
    ),
}))

it("should show the shared no-library copy and only add a library", () => {
  render(<NoLibraryEmptyState />)

  expect(screen.getByText("home.noLibrary.title")).toBeTruthy()
  expect(screen.getByText("home.noLibrary.detail")).toBeTruthy()
  expect(screen.getAllByRole("button")).toHaveLength(1)

  fireEvent.press(screen.getByText("library.addLibrary"))

  expect(router.push).toHaveBeenCalledWith("/settings/add-library")
})
