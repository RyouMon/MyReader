import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Icon, Label, NativeTabs, VectorIcon } from "expo-router/unstable-native-tabs";

import { useThemePalette } from "@/src/design/tokens";

export default function TabsLayout() {
  const palette = useThemePalette();

  return (
    <NativeTabs tintColor={palette.primary} backgroundColor={palette.surface}>
      <NativeTabs.Trigger name="home">
        <Icon
          sf={{ default: "house", selected: "house.fill" }}
          androidSrc={{
            default: <VectorIcon family={MaterialIcons} name="home-filled" />,
            selected: <VectorIcon family={MaterialIcons} name="home-filled" />,
          }}
        />
        <Label>主页</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <Icon
          sf={{ default: "books.vertical", selected: "books.vertical.fill" }}
          androidSrc={{
            default: <VectorIcon family={MaterialIcons} name="library-books" />,
            selected: <VectorIcon family={MaterialIcons} name="library-books" />,
          }}
        />
        <Label>书库</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
          androidSrc={{
            default: <VectorIcon family={MaterialIcons} name="settings" />,
            selected: <VectorIcon family={MaterialIcons} name="settings" />,
          }}
        />
        <Label>设置</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
