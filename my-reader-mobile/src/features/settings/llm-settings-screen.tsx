import { router, Stack } from "expo-router"
import { useTranslation } from "react-i18next"
import { ActivityIndicator } from "react-native"
import {
  Button,
  FormSelect,
  ListRow,
  Screen,
  SectionCard,
} from "@/src/components"
import { useThemePalette } from "@/src/design/tokens"
import { useLlmSettings } from "@/src/domain/llm/use-llm-settings"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import type { LlmProviderSettings } from "@/src/services/core/llm"
import { errorMessage } from "@/src/i18n/error-message"
import { Text, View } from "@/tw"

export default function LlmSettingsScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { query, select, error } = useLlmSettings()
  const { options, toolbar } = useScreenHeader({
    title: t("llm.title"),
    back: "hidden",
    backTitle: t("back"),
    close: { variant: "layout" },
  })
  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}
      <Screen>
        {query.isPending ? <ActivityIndicator color={palette.primary} /> : null}
        {error ? (
          <Text
            selectable
            accessibilityRole="alert"
            className="px-4 text-sm"
            style={{ color: palette.danger }}
          >
            {errorMessage(error)}
          </Text>
        ) : null}
        <LlmProviderSettingsList
          query={query}
          select={select}
          edit={(profile) =>
            router.push({
              pathname: "/llm-providers/form",
              params: { providerId: profile.id },
            })
          }
        />
      </Screen>
    </>
  )
}

function LlmProviderSettingsList({
  query,
  select,
  edit,
}: {
  query: ReturnType<typeof useLlmSettings>["query"]
  select: ReturnType<typeof useLlmSettings>["select"]
  edit: (profile: LlmProviderSettings) => void
}) {
  const { t } = useTranslation()
  const selected = query.data?.profiles.find(
    (profile) => profile.id === query.data?.defaultProfileId,
  )
  return (
    <View className="gap-3">
      <FormSelect
        label={t("llm.default")}
        labelMode="external"
        value={selected ? `${selected.name}/${selected.model}` : t("llm.none")}
        actions={[
          {
            id: "none",
            title: t("llm.none"),
            state: selected ? "off" : "on",
          },
          ...(query.data?.profiles.map((profile) => ({
            id: profile.id,
            title: `${profile.name}/${profile.model}`,
            state:
              profile.id === selected?.id ? ("on" as const) : ("off" as const),
          })) ?? []),
        ]}
        onSelect={(id) => select.mutate(id === "none" ? undefined : id)}
      />
      {query.data?.providers.length ? (
        <SectionCard>
          {query.data.providers.map((profile, index) => (
            <ListRow
              key={profile.id}
              title={profile.name}
              detail={profile.models.map((model) => model.model).join(" · ")}
              onPress={() => edit(profile)}
              isLast={index === query.data!.providers.length - 1}
            />
          ))}
        </SectionCard>
      ) : null}
      <Button
        icon={{ ios: "plus", android: "add" }}
        title={t("llm.add")}
        onPress={() => router.push("/llm-providers/form")}
      />
    </View>
  )
}
