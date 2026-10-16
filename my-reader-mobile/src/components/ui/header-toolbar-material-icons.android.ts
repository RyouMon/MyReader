import AddIcon from "@expo/material-symbols/add.xml"
import ArrowBackIcon from "@expo/material-symbols/arrow_back.xml"
import CheckIcon from "@expo/material-symbols/check.xml"
import CloseIcon from "@expo/material-symbols/close.xml"
import CloudIcon from "@expo/material-symbols/cloud.xml"
import CloudAlertIcon from "@expo/material-symbols/cloud_alert.xml"
import CloudDoneIcon from "@expo/material-symbols/cloud_done.xml"
import CloudDownloadIcon from "@expo/material-symbols/cloud_download.xml"
import CloudOffIcon from "@expo/material-symbols/cloud_off.xml"
import CloudSyncIcon from "@expo/material-symbols/cloud_sync.xml"
import CloudUploadIcon from "@expo/material-symbols/cloud_upload.xml"
import DeleteIcon from "@expo/material-symbols/delete.xml"
import EditIcon from "@expo/material-symbols/edit.xml"
import GridViewIcon from "@expo/material-symbols/grid_view.xml"
import ListIcon from "@expo/material-symbols/list.xml"
import LoginIcon from "@expo/material-symbols/login.xml"
import ShareIcon from "@expo/material-symbols/share.xml"
import SearchIcon from "@expo/material-symbols/search.xml"
import StarIcon from "@expo/material-symbols/star.xml"
import SwapHorizIcon from "@expo/material-symbols/swap_horiz.xml"
import type { SFSymbol } from "expo-symbols"
import type { ImageSourcePropType } from "react-native"
import StarFillIcon from "@/assets/icons/star_fill.xml"

const SF_SYMBOL_MATERIAL_ICON: Partial<Record<SFSymbol, ImageSourcePropType>> =
  {
    plus: AddIcon,
    checkmark: CheckIcon,
    xmark: CloseIcon,
    magnifyingglass: SearchIcon,
    trash: DeleteIcon,
    pencil: EditIcon,
    "arrow.clockwise": LoginIcon,
    "list.bullet": ListIcon,
    "square.grid.2x2": GridViewIcon,
    "chevron.left": ArrowBackIcon,
    star: StarIcon,
    "star.fill": StarFillIcon,
    "square.and.arrow.up": ShareIcon,
    "arrow.left.arrow.right": SwapHorizIcon,
    icloud: CloudIcon,
    "icloud.slash": CloudOffIcon,
    "checkmark.icloud": CloudDoneIcon,
    "exclamationmark.icloud": CloudAlertIcon,
    "icloud.and.arrow.up": CloudUploadIcon,
    "icloud.and.arrow.down": CloudDownloadIcon,
    "arrow.triangle.2.circlepath.icloud": CloudSyncIcon,
  }

/** Resolves a toolbar SF Symbol to its Material Symbol drawable, when mapped. */
export function resolveToolbarMaterialIcon(
  iosSfSymbol?: SFSymbol,
): ImageSourcePropType | undefined {
  if (!iosSfSymbol) return undefined
  return SF_SYMBOL_MATERIAL_ICON[iosSfSymbol]
}
