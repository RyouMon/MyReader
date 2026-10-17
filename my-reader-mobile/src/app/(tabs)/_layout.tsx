import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import chroma from "chroma-js"
import { NativeTabs } from "expo-router/unstable-native-tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useThemePalette } from "@/src/design/tokens"
import { LibraryTabVisibilityContext } from "@/src/features/library/components/library-tab-visibility"

const Trigger = NativeTabs.Trigger

export default function TabsLayout() {
  const palette = useThemePalette()
  const { t } = useTranslation()
  const [libraryVisible, setLibraryVisible] = useState(false)

  return (
    <LibraryTabVisibilityContext value={libraryVisible}>
      <NativeTabs
        tintColor={palette.primary}
        backgroundColor={palette.surface}
        indicatorColor={chroma(palette.primary).alpha(0.12).css()}
        rippleColor={chroma(palette.primary).alpha(0.16).css()}
      >
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
          unstable_nativeProps={{
            tabBarItemTestID: "tab-library",
            onDidAppear: () => setLibraryVisible(true),
            onWillDisappear: () => setLibraryVisible(false),
          }}
        >
          <Trigger.Icon
            sf={{ default: "books.vertical", selected: "books.vertical.fill" }}
            md="newsstand"
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
    </LibraryTabVisibilityContext>
  )
}
