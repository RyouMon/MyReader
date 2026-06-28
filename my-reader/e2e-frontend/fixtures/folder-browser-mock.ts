import type { Page } from "@playwright/test"
import type { IpcHandler } from "./tauri-browser-mock"

export const MOCK_ONEDRIVE_DATA_SOURCE_ID = "onedrive-test-001"
export const MOCK_WEBDAV_DATA_SOURCE_ID = "webdav-test-001"

const LONG_FOLDER_NAME =
  "VeryLongFolderNameThatExceedsTheDialogWidthAndShouldBeTruncatedAtTheEnd"

const DEEP_PATH_ROOT = "DeepNestedPath"

function buildDeepPathFolders(currentPath: string) {
  const levels = [
    "LevelOneWithAVeryLongNameToTestPathTruncation",
    "LevelTwoWithAVeryLongNameToTestPathTruncation",
    "LevelThreeWithAVeryLongNameToTestPathTruncation",
    "LevelFourWithAVeryLongNameToTestPathTruncation",
    "LevelFiveWithAVeryLongNameToTestPathTruncation",
  ]

  const parts = currentPath.split("/").filter(Boolean)
  const nextLevelIndex = parts.length - 1 // first part is DEEP_PATH_ROOT at index 0

  if (nextLevelIndex < 0 || nextLevelIndex >= levels.length) {
    return []
  }

  const nextName = levels[nextLevelIndex]
  const nextPath = `${currentPath}${nextName}/`

  return [{ name: nextName, path: nextPath }]
}

function listWebdavFolders(path: string) {
  if (path === "/") {
    return [
      { name: "CalibreLibrary", path: "/CalibreLibrary/" },
      { name: LONG_FOLDER_NAME, path: `/${LONG_FOLDER_NAME}/` },
      { name: DEEP_PATH_ROOT, path: `/${DEEP_PATH_ROOT}/` },
    ]
  }

  if (path === "/CalibreLibrary/") {
    return [
      { name: "Books", path: "/CalibreLibrary/Books/" },
      { name: "Authors", path: "/CalibreLibrary/Authors/" },
    ]
  }

  if (path.startsWith(`/${DEEP_PATH_ROOT}`)) {
    return buildDeepPathFolders(path)
  }

  return []
}

function listOnedriveFolders(path: string) {
  // Same structure for simplicity; differentiate by command name in tests if needed
  return listWebdavFolders(path)
}

export async function setupFolderBrowserMocks(page: Page) {
  await page.addInitScript(
    ({
      webdavId,
      onedriveId,
      longFolderName,
      deepPathRoot,
    }: {
      webdavId: string
      onedriveId: string
      longFolderName: string
      deepPathRoot: string
    }) => {
      const LONG_FOLDER_NAME = longFolderName
      const DEEP_PATH_ROOT = deepPathRoot

      function buildDeepPathFolders(currentPath: string) {
        const levels = [
          "LevelOneWithAVeryLongNameToTestPathTruncation",
          "LevelTwoWithAVeryLongNameToTestPathTruncation",
          "LevelThreeWithAVeryLongNameToTestPathTruncation",
          "LevelFourWithAVeryLongNameToTestPathTruncation",
          "LevelFiveWithAVeryLongNameToTestPathTruncation",
        ]
        const parts = currentPath.split("/").filter(Boolean)
        const nextLevelIndex = parts.length - 1
        if (nextLevelIndex < 0 || nextLevelIndex >= levels.length) {
          return []
        }
        const nextName = levels[nextLevelIndex]
        const nextPath = `${currentPath}${nextName}/`
        return [{ name: nextName, path: nextPath }]
      }

      function listWebdavFolders(path: string) {
        if (path === "/") {
          return [
            { name: "CalibreLibrary", path: "/CalibreLibrary/" },
            { name: LONG_FOLDER_NAME, path: `/${LONG_FOLDER_NAME}/` },
            { name: DEEP_PATH_ROOT, path: `/${DEEP_PATH_ROOT}/` },
          ]
        }
        if (path === "/CalibreLibrary/") {
          return [
            { name: "Books", path: "/CalibreLibrary/Books/" },
            { name: "Authors", path: "/CalibreLibrary/Authors/" },
          ]
        }
        if (path.startsWith(`/${DEEP_PATH_ROOT}`)) {
          return buildDeepPathFolders(path)
        }
        return []
      }

      function listOnedriveFolders(path: string) {
        return listWebdavFolders(path)
      }

      const handlers =
        (window as unknown as Record<string, Record<string, IpcHandler>>)
          .__TAURI_IPC_HANDLERS__ ?? {}

      handlers.list_data_sources = () => [
        {
          id: "local",
          name: "Local Storage",
          enabled: true,
          kind: "local",
          root_path: "/",
        },
        {
          id: webdavId,
          name: "Test WebDAV",
          enabled: true,
          kind: "webdav",
          endpoint: "https://dav.test.example.com",
          username: "testuser",
          has_password: true,
          root_path: null,
        },
        {
          id: onedriveId,
          name: "Test OneDrive",
          enabled: true,
          kind: "onedrive",
          client_id: "test-client-id",
          tenant_id: "common",
          has_refresh_token: true,
          root_path: null,
          user_name: "Test User",
          user_email: "test@example.com",
        },
      ]

      handlers.list_libraries = () => []

      handlers.webdav_list_folders = (args: {
        dataSourceId: string
        path: string
      }) => {
        if (args.dataSourceId !== webdavId) {
          throw new Error(`Unknown WebDAV data source: ${args.dataSourceId}`)
        }
        return listWebdavFolders(args.path)
      }

      handlers.onedrive_list_folders = (args: {
        dataSourceId: string
        path: string
      }) => {
        if (args.dataSourceId !== onedriveId) {
          throw new Error(`Unknown OneDrive data source: ${args.dataSourceId}`)
        }
        return listOnedriveFolders(args.path)
      }

      handlers.add_webdav_library = () => ({
        id: "lib-webdav-001",
        name: "Test Library",
        path: "/Test",
        bookCount: 0,
        sourceType: "webdav",
        dataSourceId: webdavId,
        sourcePath: "/Test",
      })

      handlers.add_onedrive_library = () => ({
        id: "lib-onedrive-001",
        name: "Test Library",
        path: "/Test",
        bookCount: 0,
        sourceType: "onedrive",
        dataSourceId: onedriveId,
        sourcePath: "/Test",
      })

      ;(
        window as unknown as Record<string, Record<string, IpcHandler>>
      ).__TAURI_IPC_HANDLERS__ = handlers
    },
    {
      webdavId: MOCK_WEBDAV_DATA_SOURCE_ID,
      onedriveId: MOCK_ONEDRIVE_DATA_SOURCE_ID,
      longFolderName: LONG_FOLDER_NAME,
      deepPathRoot: DEEP_PATH_ROOT,
    },
  )
}

export { LONG_FOLDER_NAME, DEEP_PATH_ROOT }
