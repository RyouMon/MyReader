import CALIBRE_LIBRARY_ICON from "../../../assets/images/calibre-library-icon.png"
import MYREADER_LIBRARY_ICON from "../../../assets/images/myreader-library-icon.png"

import type { ListRowIcon } from "./list-row"
import { DropboxIcon, GoogleDriveIcon, S3StorageIcon } from "./provider-icons"

export type EntityIconKind =
  | "myreaderLibrary"
  | "calibreLibrary"
  | "appStorage"
  | "localDataSource"
  | "webdavDataSource"
  | "onedriveDataSource"
  | "gdriveDataSource"
  | "dropboxDataSource"
  | "s3DataSource"

/**
 * Shared entity icons for list rows. Libraries use their respective artwork;
 * data sources use provider marks or native platform symbols.
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
  gdriveDataSource: {
    render: ({ size }) => <GoogleDriveIcon size={size} />,
  },
  dropboxDataSource: {
    render: ({ size }) => <DropboxIcon size={size} />,
  },
  s3DataSource: {
    render: ({ size }) => <S3StorageIcon size={size} />,
  },
} as const satisfies Record<EntityIconKind, ListRowIcon>
