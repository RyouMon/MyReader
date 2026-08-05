import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { NativeTabs } from "expo-router/unstable-native-tabs"
import { useTranslation } from "react-i18next"

import { useThemePalette } from "@/src/design/tokens"

const Trigger = NativeTabs.Trigger

export default function TabsLayout() {
  const palette = useThemePalette()
  const { t } = useTranslation()

  return (
    <NativeTabs tintColor={palette.primary} backgroundColor={palette.surface}>
      <Trigger
        name="home"
        unstable_nativeProps={{ tabBarItemTestID: "tab-home" }}
      >
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
        <Trigger.Label>{t("tabs.home")}</Trigger.Label>
      </Trigger>
      <Trigger
        name="library"
        unstable_nativeProps={{ tabBarItemTestID: "tab-library" }}
      >
        <Trigger.Icon
          sf={{ default: "books.vertical", selected: "books.vertical.fill" }}
          src={{
            default: (
              <Trigger.VectorIcon family={MaterialIcons} name="library-books" />
            ),
            selected: (
              <Trigger.VectorIcon family={MaterialIcons} name="library-books" />
            ),
          }}
        />
        <Trigger.Label>{t("tabs.library")}</Trigger.Label>
      </Trigger>
      <Trigger
        name="settings"
        unstable_nativeProps={{ tabBarItemTestID: "tab-settings" }}
      >
        <Trigger.Icon
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
          src={{
            default: (
              <Trigger.VectorIcon family={MaterialIcons} name="settings" />
            ),
            selected: (
              <Trigger.VectorIcon family={MaterialIcons} name="settings" />
            ),
          }}
        />
        <Trigger.Label>{t("tabs.settings")}</Trigger.Label>
      </Trigger>
    </NativeTabs>
  )
}
