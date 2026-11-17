import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import { RemoteFolderCreationForm } from "./remote-folder-creation-form"

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))
jest.mock("expo-symbols", () => ({ SymbolView: jest.fn(() => null) }))
jest.mock("expo-router", () => ({ router: {} }))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/components", () => ({
  ...jest.requireActual("@/src/components/ui/button"),
  ...jest.requireActual("@/src/components/ui/form-text-field"),
}))
jest.mock("@/src/design/tokens", () => ({
  useTheme: () => ({ colorScheme: "light", palette: {} }),
  useThemePalette: () => ({}),
}))

const props = {
  currentPath: "/Books",
  disabled: false,
  creating: false,
  error: null,
  onCreate: jest.fn(),
  onCreated: jest.fn(),
  onCancel: jest.fn(),
}

beforeEach(() => jest.clearAllMocks())

it("starts empty, blocks invalid names and lets the user cancel without a remote write", () => {
  render(<RemoteFolderCreationForm {...props} />)
  const input = screen.getByLabelText("remoteFolder.name")
  expect(input.props.value).toBe("")
  const confirm = screen.getByRole("button", { name: "common.confirm" })
  expect(confirm).toBeDisabled()
  fireEvent.changeText(input, "../Books")
  expect(confirm).toBeDisabled()
  fireEvent(input, "submitEditing")
  expect(props.onCreate).not.toHaveBeenCalled()
  fireEvent.press(screen.getByRole("button", { name: "common.cancel" }))
  expect(props.onCancel).toHaveBeenCalledTimes(1)
})

it("keeps a failed draft editable and confirms a corrected name", async () => {
  props.onCreate.mockResolvedValueOnce(null)
  const { rerender } = render(<RemoteFolderCreationForm {...props} />)
  fireEvent.changeText(screen.getByLabelText("remoteFolder.name"), "Existing")
  fireEvent.press(screen.getByRole("button", { name: "common.confirm" }))
  await waitFor(() => expect(props.onCreate).toHaveBeenCalledWith("Existing"))
  rerender(
    <RemoteFolderCreationForm
      {...props}
      error="REMOTE_DIRECTORY_ALREADY_EXISTS"
    />,
  )
  expect(screen.getByRole("alert")).toHaveTextContent("remoteFolder.exists")
  expect(screen.getByLabelText("remoteFolder.name").props.value).toBe(
    "Existing",
  )
  expect(props.onCreated).not.toHaveBeenCalled()
  props.onCreate.mockResolvedValueOnce({
    name: "新书库",
    path: "/Books/新书库",
    isDirectory: true,
  })
  fireEvent.changeText(screen.getByLabelText("remoteFolder.name"), " 新书库 ")
  fireEvent(screen.getByLabelText("remoteFolder.name"), "submitEditing")
  await waitFor(() => expect(props.onCreated).toHaveBeenCalledTimes(1))
  expect(props.onCreate).toHaveBeenLastCalledWith("新书库")
})

it("prevents editing, cancellation and repeated confirmation during creation", () => {
  render(<RemoteFolderCreationForm {...props} creating />)
  expect(screen.getByLabelText("remoteFolder.name").props.editable).toBe(false)
  expect(
    screen.getByRole("button", { name: "remoteFolder.creating" }),
  ).toBeDisabled()
  const cancel = screen.getByRole("button", { name: "common.cancel" })
  expect(cancel).toBeDisabled()
  fireEvent.press(cancel)
  expect(props.onCancel).not.toHaveBeenCalled()
})
