import Reanimated from "react-native-reanimated";
import { View } from "./primitives";

export const Animated = {
  ...Reanimated,
  View: Reanimated.createAnimatedComponent(View),
};
