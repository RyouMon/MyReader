import type { SFSymbol } from "expo-symbols";
import type { ImageSourcePropType } from "react-native";

import AddIcon from "@expo/material-symbols/add.xml";
import ArrowBackIcon from "@expo/material-symbols/arrow_back.xml";
import CheckIcon from "@expo/material-symbols/check.xml";
import DeleteIcon from "@expo/material-symbols/delete.xml";
import ShareIcon from "@expo/material-symbols/share.xml";
import StarFillIcon from "@/assets/icons/star_fill.xml";
import StarIcon from "@expo/material-symbols/star.xml";
import SwapHorizIcon from "@expo/material-symbols/swap_horiz.xml";

const SF_SYMBOL_MATERIAL_ICON: Partial<Record<SFSymbol, ImageSourcePropType>> = {
  plus: AddIcon,
  checkmark: CheckIcon,
  trash: DeleteIcon,
  "chevron.left": ArrowBackIcon,
  star: StarIcon,
  "star.fill": StarFillIcon,
  "square.and.arrow.up": ShareIcon,
  "arrow.left.arrow.right": SwapHorizIcon,
};

/** Resolves a toolbar SF Symbol to its Material Symbol drawable, when mapped. */
export function resolveToolbarMaterialIcon(iosSfSymbol?: SFSymbol): ImageSourcePropType | undefined {
  if (!iosSfSymbol) return undefined;
  return SF_SYMBOL_MATERIAL_ICON[iosSfSymbol];
}
