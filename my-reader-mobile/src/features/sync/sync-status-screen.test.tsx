import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react-native"

import SyncStatusScreen from "./sync-status-screen"

const mockSyncNow = jest.fn((_libraryId: string, _options?: unknown) =>
  Promise.resolve({}),
)
let mockPresentation = {
  activeLibraryId: "library-1" as string | null,
  activity: undefined as
    | {
        taskId: string
        stage: "preparing" | "pushing" | "pulling" | "applying"
        completed: number
        total: number
        startedAt: number
        reason: "manual" | "local_change" | "automatic_check"
      }
    | undefined,
  history: undefined as
    | {
        lastSync?: {
          completedAt: number
          reason?: "manual" | "local_change" | "automatic_check"
        }
        lastFailure?: {
          completedAt: number
          failureStage?: "preparing" | "pushing" | "pulling" | "applying"
          message?: string
          reason?: "manual" | "local_change" | "automatic_check"
        }
      }
    | undefined,
  transientResult: undefined as
    | {
        result: "unchanged"
        completedAt: number
        reason: "manual" | "local_change" | "automatic_check"
      }
    | undefined,
  indicator: "idle" as
    | "idle"
    | "offline"
    | "recent_success"
    | "unchanged"
    | "syncing"
    | "pushing"
    | "pulling"
    | "failed",
  isOffline: false,
  library: { id: "library-1", name: "Current Library" },
}

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light" },
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    background: "#fff",
    border: "#ddd",
    danger: "#b00",
    dangerSoft: "#fee",
    primary: "#c4622d",
    success: "#080",
    successSoft: "#efe",
    surface: "#fff",
    text: "#111",
    textMuted: "#666",
    warning: "#a60",
    warningSoft: "#ffe",
  }),
}))

jest.mock("@/src/domain/sync/hooks/use-sync-library", () => ({
  useSyncLibrary: () => ({
    isSyncing: false,
    syncNow: (libraryId: string, options?: unknown) =>
      mockSyncNow(libraryId, options),
  }),
}))

jest.mock("./hooks/use-sync-status-presentation", () => ({
  useSyncStatusPresentation: () => mockPresentation,
}))

jest.mock("./components/sync-status-icon", () => ({
  SyncStatusIcon: () => null,
}))

jest.mock("@/src/components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    Button: ({
      accessibilityLabel,
      disabled,
      onPress,
      textClassName,
      title,
    }: {
      accessibilityLabel: string
      disabled: boolean
      onPress: () => void
      textClassName?: string
      title: string
    }) =>
      React.createElement(
        Pressable,
        {
          accessibilityLabel,
          accessibilityRole: "button",
          disabled,
          onPress,
        },
        React.createElement(Text, { className: textClassName }, title),
      ),
    EmptyState: ({ detail, title }: { detail: string; title: string }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        React.createElement(Text, null, detail),
      ),
    ListRow: ({ title, value }: { title: string; value?: string }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        value ? React.createElement(Text, null, value) : null,
      ),
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    SectionCard: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  }
})

describe("SyncStatusScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPresentation = {
      activeLibraryId: "library-1",
      activity: undefined,
      history: undefined,
      transientResult: undefined,
      indicator: "idle",
      isOffline: false,
      library: { id: "library-1", name: "Current Library" },
    }
  })

  it("should manually sync only the current active library", async () => {
    render(<SyncStatusScreen />)

    fireEvent.press(
      screen.getByRole("button", { name: "syncStatus.manualSync" }),
    )

    await waitFor(() => {
      expect(mockSyncNow).toHaveBeenCalledWith("library-1", {
        showFailureAlert: false,
      })
    })
  })

  it("should show the last failure stage and reason", () => {
    mockPresentation = {
      ...mockPresentation,
      history: {
        lastFailure: {
          completedAt: Date.now(),
          failureStage: "applying",
          message: "History is damaged",
        },
      },
      indicator: "failed",
    }

    render(<SyncStatusScreen />)

    expect(screen.getByText("syncStatus.failureStage")).toBeTruthy()
    expect(screen.getByText("syncStatus.stage.applying")).toBeTruthy()
    expect(screen.getByText("History is damaged")).toBeTruthy()
  })

  it("should show the current trigger reason while syncing", () => {
    mockPresentation = {
      ...mockPresentation,
      activity: {
        taskId: "task-1",
        stage: "pushing",
        completed: 1,
        total: 2,
        startedAt: 100,
        reason: "local_change",
      },
      history: {
        lastSync: {
          completedAt: 50,
          reason: "manual",
        },
      },
      indicator: "pushing",
    }

    render(<SyncStatusScreen />)

    expect(screen.getByText("syncStatus.currentReason")).toBeTruthy()
    expect(screen.getByText("syncStatus.reason.localChange")).toBeTruthy()
    expect(screen.queryByText("syncStatus.lastReason")).toBeNull()
  })

  it("should show the last trigger reason after syncing", () => {
    mockPresentation = {
      ...mockPresentation,
      history: {
        lastSync: {
          completedAt: Date.now(),
          reason: "manual",
        },
      },
      indicator: "recent_success",
    }

    render(<SyncStatusScreen />)

    expect(screen.getByText("syncStatus.lastReason")).toBeTruthy()
    expect(screen.getByText("syncStatus.reason.manual")).toBeTruthy()
  })

  it("should show unchanged as a current result without replacing history", () => {
    mockPresentation = {
      ...mockPresentation,
      history: {
        lastSync: {
          completedAt: 100,
          reason: "local_change",
        },
      },
      transientResult: {
        result: "unchanged",
        completedAt: Date.now(),
        reason: "automatic_check",
      },
      indicator: "unchanged",
    }

    render(<SyncStatusScreen />)

    expect(screen.getAllByText("syncStatus.state.unchanged")).toHaveLength(2)
    expect(screen.getByText("syncStatus.currentReason")).toBeTruthy()
    expect(screen.getByText("syncStatus.reason.automaticCheck")).toBeTruthy()
    expect(screen.queryByText("syncStatus.lastReason")).toBeNull()
  })

  it("should render the sheet title inside its fixed content", () => {
    render(<SyncStatusScreen />)

    const title = screen.getByRole("header", { name: "syncStatus.title" })
    expect(title).toBeTruthy()
  })

  it("should keep the summary sticky and the action outside the details", () => {
    render(<SyncStatusScreen />)

    const details = screen.getByTestId("sync-status-details-scroll")
    const summary = screen.getByTestId("sync-status-summary")
    const footer = screen.getByTestId("sync-status-action-footer")

    expect(within(details).getByTestId("sync-status-summary")).toBeTruthy()
    expect(details.props.stickyHeaderIndices).toEqual([0])
    expect(within(details).queryByRole("button")).toBeNull()
    expect(within(summary).queryByText("Current Library")).toBeNull()
    expect(
      within(summary).getByTestId("sync-status-progress-slot", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy()
    expect(within(footer).getByRole("button")).toBeTruthy()
  })

  it("should reserve the progress slot before and during syncing", () => {
    const view = render(<SyncStatusScreen />)
    expect(
      screen.getByTestId("sync-status-progress-slot", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy()

    mockPresentation = {
      ...mockPresentation,
      activity: {
        taskId: "task-1",
        stage: "pushing",
        completed: 1,
        total: 2,
        startedAt: 100,
        reason: "manual",
      },
      indicator: "pushing",
    }
    view.rerender(<SyncStatusScreen />)

    expect(screen.getByTestId("sync-status-progress-slot")).toBeTruthy()
    expect(screen.getByText("syncStatus.progress")).toBeTruthy()
  })

  it("should emphasize the status in the fixed summary", () => {
    mockPresentation = {
      ...mockPresentation,
      indicator: "recent_success",
    }

    render(<SyncStatusScreen />)

    const summary = screen.getByTestId("sync-status-summary")
    const status = within(summary).getByText("syncStatus.state.recentSuccess")
    expect(status.props.className).toContain("font-bold")
  })
})
