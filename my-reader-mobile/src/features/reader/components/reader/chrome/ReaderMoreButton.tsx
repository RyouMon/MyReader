import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";
import { type ReaderChromePalette, underlayFromSurface } from "@/src/design/reader-chrome-palette";
import { TouchableHighlight } from "@/tw";

type Props = {
  insetsBottom: number;
  visible: boolean;
  palette: ReaderChromePalette;
  onPress: () => void;
};

const BTN_SIZE = 44;
const ICON_SIZE = 22;

export default function ReaderMoreButton({ insetsBottom, visible, palette, onPress }: Props) {
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withDelay(50, withTiming(1, { duration: 200 }));
      scale.value = withDelay(50, withSpring(1, { stiffness: 260, damping: 20 }));
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      scale.value = withTiming(0.85, { duration: 150 });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          bottom: Math.max(insetsBottom, 12) + 8,
          right: 16,
          width: BTN_SIZE,
          height: BTN_SIZE,
          borderRadius: BTN_SIZE / 2,
          backgroundColor: palette.actionSurface,
          alignItems: "center",
          justifyContent: "center",
        },
        animatedStyle,
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <TouchableHighlight
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="More actions"
        hitSlop={4}
        underlayColor={underlayFromSurface(palette.actionSurface, palette.bg)}
        className="h-[44px] w-[44px] items-center justify-center rounded-full"
      >
        <MaterialIcons name="more-horiz" size={ICON_SIZE} color={palette.actionText} />
      </TouchableHighlight>
    </Animated.View>
  );
}
