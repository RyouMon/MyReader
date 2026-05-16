import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useThemePalette } from "@/src/design/tokens";

const Trigger = NativeTabs.Trigger;

export default function TabsLayout() {
  const palette = useThemePalette();

  return (
    <NativeTabs tintColor={palette.primary} backgroundColor={palette.surface}>
      <Trigger name="home">
        <Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          src={{
            default: (
              <Trigger.VectorIcon family={MaterialIcons} name="home-filled" />
            ),
            selected: (
              <Trigger.VectorIcon family={MaterialIcons} name="home-filled" />
            ),
          }}
        />
        <Trigger.Label>主页</Trigger.Label>
      </Trigger>
      <Trigger name="library">
        <Trigger.Icon
          sf={{ default: "books.vertical", selected: "books.vertical.fill" }}
          src={{
            default: (
              <Trigger.VectorIcon
                family={MaterialIcons}
                name="library-books"
              />
            ),
            selected: (
              <Trigger.VectorIcon
                family={MaterialIcons}
                name="library-books"
              />
            ),
          }}
        />
        <Trigger.Label>书库</Trigger.Label>
      </Trigger>
      <Trigger name="settings">
        <Trigger.Icon
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
          src={{
            default: <Trigger.VectorIcon family={MaterialIcons} name="settings" />,
            selected: <Trigger.VectorIcon family={MaterialIcons} name="settings" />,
          }}
        />
        <Trigger.Label>设置</Trigger.Label>
      </Trigger>
    </NativeTabs>
  );
}
