import type { ImageSourcePropType } from "react-native"

import type { ListRowIcon } from "./list-row"

export type EntityIconKind =
  | "myreaderLibrary"
  | "calibreLibrary"
  | "appStorage"
  | "localDataSource"
  | "webdavDataSource"
  | "onedriveDataSource"

const MYREADER_LIBRARY_ICON =
  require("../../../assets/images/myreader-library-icon.png") as ImageSourcePropType
const CALIBRE_LIBRARY_ICON =
  require("../../../assets/images/calibre-library-icon.png") as ImageSourcePropType

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
