import CALIBRE_LIBRARY_ICON from "../../../assets/images/calibre-library-icon.png"
import MYREADER_LIBRARY_ICON from "../../../assets/images/myreader-library-icon.png"

import type { ListRowIcon } from "./list-row"

export type EntityIconKind =
  | "myreaderLibrary"
  | "calibreLibrary"
  | "appStorage"
  | "localDataSource"
  | "webdavDataSource"
  | "onedriveDataSource"

/**
 * Shared entity icons for list rows. Libraries use their respective artwork;
 * data sources use native platform symbols until provider artwork is available.
 */
export const ENTITY_LIST_ROW_ICONS = {
  myreaderLibrary: { imageSource: MYREADER_LIBRARY_ICON },
  calibreLibrary: { imageSource: CALIBRE_LIBRARY_ICON },
  appStorage: { ios: "internaldrive", android: "storage" },
  localDataSource: { ios: "externaldrive", android: "storage" },
  webdavDataSource: {
    ios: "dns",
    android: "dns",
    iconSet: "material",
    tone: "webdav",
  },
  onedriveDataSource: {
    ios: "cloud.fill",
    android: "cloud",
    tone: "onedrive",
  },
} as const satisfies Record<EntityIconKind, ListRowIcon>
