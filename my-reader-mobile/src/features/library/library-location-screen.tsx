import { useQuery } from "@tanstack/react-query"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { usePreventRemove } from "expo-router/react-navigation"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, ListRow, SectionCard, Screen } from "@/src/components/ui"
import { useThemePalette } from "@/src/design/tokens"
import { LibraryLocationNotice } from "@/src/components/library-location-notice"
import { useLibraryLocation } from "@/src/domain/library/hooks/use-library-location"
import {
  pickLocalLibraryDirectory,
  type PickedLocalLibrary,
} from "@/src/domain/library/local-library-picker"
import { relocateLibrary } from "@/src/domain/library/relocate-library"
import { useSyncLibrary } from "@/src/domain/sync/hooks/use-sync-library"
import type { LibraryLocation } from "@/src/services/core/library-location"
import { listRemoteDirectories } from "@/src/services/core/remote"
import { useAppStore } from "@/src/store/app-store"
import { Text, View } from "@/tw"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"

function LocationError({ errors }: { errors: unknown[] }) {
  const palette = useThemePalette()
  const error = errors.find(Boolean)
  return error ? (
    <Text
      selectable
      accessibilityRole="alert"
      style={{ color: palette.danger }}
    >
      {String(error)}
    </Text>
  ) : null
}

function DirectoryPicker({
  source,
  path,
  saving,
  onNavigate,
  onSave,
}: {
  source: Parameters<typeof listRemoteDirectories>[0]
  path: string
  saving: boolean
  onNavigate: (path: string) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const folders = useQuery({
    queryKey: ["locationFolders", source.id, path],
    retry: false,
    queryFn: () => listRemoteDirectories(source, path),
  })
  return (
    <View className="gap-3">
      <Text selectable style={{ color: palette.text }}>
        {path}
      </Text>
      <Button
        title={t("libraryLocation.up")}
        disabled={saving || path === "/"}
        onPress={() =>
          onNavigate(
            path.split("/").filter(Boolean).slice(0, -1).join("/") || "/",
          )
        }
      />
      {folders.error ? (
        <View className="gap-2">
          <LocationError errors={[folders.error]} />
          <Button
            title={t("libraryLocation.retry")}
            onPress={() => void folders.refetch()}
          />
        </View>
      ) : null}
      <SectionCard>
        {folders.data
          ?.filter((entry) => entry.isDirectory)
          .map((entry) => (
            <ListRow
              key={entry.path}
              title={entry.name}
              onPress={saving ? undefined : () => onNavigate(entry.path)}
            />
          ))}
      </SectionCard>
      <Button
        title={t("libraryLocation.save")}
        loading={saving}
        disabled={saving || folders.isFetching}
        onPress={onSave}
      />
    </View>
  )
}

export default function LibraryLocationScreen() {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>()
  const library = useAppStore(
    (state) => state.libraries.find((item) => item.id === libraryId) ?? null,
  )
  const source = useAppStore((state) =>
    state.dataSources.find((item) => item.id === library?.dataSourceId),
  )
  const activeId = useAppStore((state) => state.activeLibraryId)
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { options, toolbar } = useScreenHeader({
    title: t("libraryLocation.title"),
  })
  const info = useLibraryLocation(library)
  const [result, setResult] = useState<LibraryLocation | null>(null)
  const [path, setPath] = useState(library?.sourcePath ?? "/")
  const [browsing, setBrowsing] = useState(false)
  const [picked, setPicked] = useState<PickedLocalLibrary | null>(null)
  const [saving, setSaving] = useState(false)
  usePreventRemove(saving, () => {})
  const [error, setError] = useState<string | null>(null)
  const { syncNow, isSyncing } = useSyncLibrary()
  const location = result ?? info.data
  const saved = !!result && !result.problem

  async function choose() {
    if (source) {
      setBrowsing(true)
      return
    }
    try {
      setPicked(await pickLocalLibraryDirectory())
    } catch (error) {
      setError(String(error))
    }
  }
  async function save() {
    if (!library) return
    setSaving(true)
    setError(null)
    try {
      const next = await relocateLibrary(
        library,
        picked?.uri ?? path,
        picked?.securityScopedBookmark,
        picked?.uri,
      )
      setResult(next)
      if (!next.problem) {
        setBrowsing(false)
        setPicked(null)
      }
    } catch (error) {
      setError(String(error))
    } finally {
      setSaving(false)
    }
  }
  async function retry() {
    if (!library) return
    setError(null)
    try {
      await syncNow(library.id, { showFailureAlert: false })
    } catch (error) {
      setError(String(error))
    }
  }
  return (
    <>
      <Stack.Screen
        options={{
          ...options,
          gestureEnabled: !saving,
          headerBackVisible: !saving,
        }}
      />
      {toolbar}
      <Screen>
        <Text style={{ color: palette.textMuted }}>
          {t("libraryLocation.keepData")}
        </Text>
        {location ? (
          <LibraryLocationNotice
            location={location}
            sourceType={library?.sourceType}
          />
        ) : null}
        {info.isPending ? (
          <Text style={{ color: palette.text }}>
            {t("library.loading.title")}
          </Text>
        ) : null}
        <LocationError errors={[info.error, error]} />
        {saved ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: palette.success }}
          >
            {t("libraryLocation.saved")}
          </Text>
        ) : null}
        {browsing && source ? (
          <DirectoryPicker
            source={source}
            path={path}
            saving={saving}
            onNavigate={setPath}
            onSave={() => void save()}
          />
        ) : null}
        {picked ? (
          <Text selectable style={{ color: palette.text }}>
            {picked.uri}
          </Text>
        ) : null}
        {location?.canRelocate && !browsing ? (
          <Button
            title={t("libraryLocation.choose")}
            disabled={saving}
            onPress={() => void choose()}
          />
        ) : null}
        {picked ? (
          <Button
            title={t("libraryLocation.save")}
            loading={saving}
            disabled={saving}
            onPress={() => void save()}
          />
        ) : null}
        {saved && libraryId === activeId ? (
          <Button
            title={t("libraryLocation.retry")}
            disabled={isSyncing}
            loading={isSyncing}
            onPress={() => void retry()}
          />
        ) : null}
        <Button
          title={t("common.cancel")}
          disabled={saving}
          onPress={() => router.back()}
        />
      </Screen>
    </>
  )
}
