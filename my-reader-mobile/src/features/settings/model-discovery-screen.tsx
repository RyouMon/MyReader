import CheckIcon from "@expo/material-symbols/check.xml"
import CloseIcon from "@expo/material-symbols/close.xml"
import { Redirect, router, Stack } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  BackHandler,
  FlatList,
  View as NativeView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { AndroidHeaderIconButton } from "@/src/components/ui/android-header-icon-button"
import {
  ANDROID_HEADER_EDGE_INSET,
  AndroidHeaderActions,
  AndroidHeaderTitle,
} from "@/src/components/ui/android-header-layout"
import { PlatformIcon } from "@/src/components/ui/platform-icon"
import { useThemePalette } from "@/src/design/tokens"
import { errorMessage } from "@/src/i18n/error-message"
import { Text, View } from "@/tw"
import {
  closeModelDiscovery,
  type ModelDiscoverySession,
  useModelDiscoveryStore,
} from "./model-discovery-session"

const SEARCH_THRESHOLD = 8

function useOptionalSafeAreaBottom(): number {
  try {
    return useSafeAreaInsets().bottom
  } catch {
    return 0
  }
}

type DiscoveryRow = {
  id: string
  added: boolean
}

function buildDiscoveryRows(
  models: { id: string }[] | undefined,
  existing: string[] | undefined,
  query: string,
) {
  const seen = new Set<string>()
  const unique = (models ?? []).filter((model) => {
    if (!model.id || seen.has(model.id)) return false
    seen.add(model.id)
    return true
  })
  const existingSet = new Set(
    (existing ?? []).map((id) => id.trim()).filter(Boolean),
  )
  const available = unique
    .filter((model) => !existingSet.has(model.id))
    .map((model) => ({ id: model.id, added: false }))
  const added = unique
    .filter((model) => existingSet.has(model.id))
    .map((model) => ({ id: model.id, added: true }))
  const normalized = query.trim().toLowerCase()
  const visibleAvailable = normalized
    ? available.filter((row) => row.id.toLowerCase().includes(normalized))
    : available
  const visibleAdded = normalized
    ? added.filter((row) => row.id.toLowerCase().includes(normalized))
    : added
  return {
    totalCount: unique.length,
    availableCount: available.length,
    rows: [...visibleAvailable, ...visibleAdded],
    filteredAvailableIds: visibleAvailable.map((row) => row.id),
  }
}

function ModelDiscoveryIosToolbar({
  busy,
  canConfirm,
  onClose,
  onConfirm,
}: {
  busy: boolean
  canConfirm: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  if (Platform.OS !== "ios") return null
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={t("common.close")}
          disabled={busy}
          icon="xmark"
          onPress={onClose}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t("providerEditor.addSelected")}
          disabled={!canConfirm || busy}
          onPress={onConfirm}
          separateBackground
          tintColor={palette.primary}
          variant="prominent"
        >
          <Stack.Toolbar.Icon sf={busy ? "progress.indicator" : "checkmark"} />
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  )
}

function ModelDiscoveryAndroidHeader({
  busy,
  canConfirm,
  onClose,
  onConfirm,
}: {
  busy: boolean
  canConfirm: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  if (Platform.OS !== "android") return null
  return (
    <View
      className="min-h-14 flex-row items-center"
      style={{ paddingHorizontal: ANDROID_HEADER_EDGE_INSET }}
    >
      <AndroidHeaderActions>
        <AndroidHeaderIconButton
          accessibilityLabel={t("common.close")}
          disabled={busy}
          icon={CloseIcon}
          onPress={onClose}
          testID="model-discovery-close-button"
        />
      </AndroidHeaderActions>
      <AndroidHeaderTitle color={palette.text}>
        {t("providerEditor.selectModels")}
      </AndroidHeaderTitle>
      <AndroidHeaderActions>
        <AndroidHeaderIconButton
          accessibilityLabel={t("providerEditor.addSelected")}
          color={palette.primary}
          disabled={!canConfirm || busy}
          icon={CheckIcon}
          loading={busy}
          onPress={onConfirm}
          testID="model-discovery-confirm-button"
        />
      </AndroidHeaderActions>
    </View>
  )
}

function ModelDiscoveryListHeader({
  submitError,
  showSearch,
  query,
  availableCount,
  filteredAvailableCount,
  selectedCount,
  allVisibleSelected,
  busy,
  onQueryChange,
  onToggleSelectAll,
}: {
  submitError: string | null
  showSearch: boolean
  query: string
  availableCount: number
  filteredAvailableCount: number
  selectedCount: number
  allVisibleSelected: boolean
  busy: boolean
  onQueryChange: (text: string) => void
  onToggleSelectAll: () => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  return (
    <View>
      {submitError ? (
        <Text
          selectable
          accessibilityRole="alert"
          className="px-1 pb-3 text-base"
          style={{ color: palette.danger }}
        >
          {submitError}
        </Text>
      ) : null}
      {showSearch ? (
        <ModelSearchInput
          value={query}
          disabled={busy}
          onChangeText={onQueryChange}
        />
      ) : null}
      {availableCount === 0 ? (
        <Text
          className="px-1 pb-3 text-base"
          style={{ color: palette.textMuted }}
        >
          {t("providerEditor.noNewModels")}
        </Text>
      ) : filteredAvailableCount > 0 || selectedCount > 0 ? (
        <View className="flex-row items-center justify-between px-1 pb-2">
          <Text className="text-base" style={{ color: palette.textMuted }}>
            {selectedCount > 0
              ? t("providerEditor.selectedCount", { count: selectedCount })
              : ""}
          </Text>
          {filteredAvailableCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              className="min-h-11 justify-center rounded-lg px-2"
              disabled={busy}
              hitSlop={4}
              onPress={onToggleSelectAll}
              style={({ pressed }) => ({
                opacity: busy ? 0.45 : pressed ? 0.65 : 1,
              })}
            >
              <Text
                className="text-base font-medium"
                style={{ color: palette.primary }}
              >
                {allVisibleSelected
                  ? t("common.deselectAll")
                  : t("common.selectAll")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function ModelDiscoveryRow({
  item,
  checked,
  busy,
  isLast,
  onToggle,
}: {
  item: DiscoveryRow
  checked: boolean
  busy: boolean
  isLast: boolean
  onToggle: (id: string) => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const borderStyle = {
    borderBottomColor: palette.border,
    borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
  }

  if (item.added) {
    return (
      <View
        className="flex-row items-center justify-between gap-3 px-4 py-3.5"
        style={[borderStyle, { backgroundColor: palette.surface }]}
      >
        <Text
          numberOfLines={1}
          className="flex-1 text-base"
          style={{ color: palette.textMuted }}
        >
          {item.id}
        </Text>
        <View
          className="rounded-lg px-2.5 py-1"
          style={{ backgroundColor: palette.backgroundSecondary }}
        >
          <Text className="text-base" style={{ color: palette.textMuted }}>
            {t("providerEditor.modelAdded")}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={item.id}
      accessibilityState={{ checked, disabled: busy }}
      disabled={busy}
      onPress={() => onToggle(item.id)}
      style={({ pressed }) => [
        borderStyle,
        {
          backgroundColor:
            checked || pressed ? palette.backgroundSecondary : palette.surface,
        },
      ]}
    >
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        <PlatformIcon
          name={
            checked
              ? { ios: "checkmark.circle.fill", android: "check-circle" }
              : { ios: "circle", android: "radio-button-unchecked" }
          }
          size={22}
          color={checked ? palette.primary : palette.borderStrong}
        />
        <Text
          numberOfLines={1}
          className="flex-1 text-base"
          style={{ color: palette.text }}
        >
          {item.id}
        </Text>
      </View>
    </Pressable>
  )
}

function ModelSearchInput({
  value,
  disabled,
  onChangeText,
}: {
  value: string
  disabled: boolean
  onChangeText: (text: string) => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  return (
    <View className="pb-3">
      <View
        className="flex-row items-center gap-2 rounded-2xl border px-3 py-2"
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
        }}
      >
        <PlatformIcon
          name={{ ios: "magnifyingglass", android: "search" }}
          size={18}
          color={palette.textMuted}
        />
        <TextInput
          value={value}
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel={t("providerEditor.searchModels")}
          placeholder={t("providerEditor.searchModels")}
          placeholderTextColor={palette.textMuted}
          onChangeText={onChangeText}
          style={{
            flex: 1,
            color: palette.text,
            fontSize: 16,
            paddingVertical: 2,
          }}
        />
      </View>
    </View>
  )
}

export default function ModelDiscoveryScreen() {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const bottomInset = useOptionalSafeAreaBottom()
  const activeSession = useModelDiscoveryStore((state) => state.session)
  const [retainedSession, setRetainedSession] =
    useState<ModelDiscoverySession | null>(activeSession)
  const session = activeSession ?? retainedSession
  const sessionId = session?.id ?? null

  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (activeSession) {
      setRetainedSession(activeSession)
    }
  }, [activeSession])

  useEffect(() => {
    if (sessionId === null) return
    setSelected([])
    setQuery("")
    setSubmitError(null)
    return () => closeModelDiscovery(sessionId)
  }, [sessionId])

  useEffect(() => {
    if (Platform.OS !== "android" || !submitting) return
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    )
    return () => subscription.remove()
  }, [submitting])

  const dismiss = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace("/settings")
  }, [])

  const models = session?.models
  const existing = session?.existing
  const { totalCount, availableCount, rows, filteredAvailableIds } = useMemo(
    () => buildDiscoveryRows(models, existing, query),
    [existing, models, query],
  )

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const allVisibleSelected =
    filteredAvailableIds.length > 0 &&
    filteredAvailableIds.every((id) => selectedSet.has(id))

  if (!session) {
    return <Redirect href="/settings" />
  }

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  const toggleSelectAll = () => {
    if (filteredAvailableIds.length === 0) return
    if (allVisibleSelected) {
      const visibleSet = new Set(filteredAvailableIds)
      setSelected((current) => current.filter((id) => !visibleSet.has(id)))
      return
    }
    setSelected((current) => [
      ...current,
      ...filteredAvailableIds.filter((id) => !current.includes(id)),
    ])
  }

  const handleClose = () => {
    if (submitting) return
    closeModelDiscovery(session.id)
    dismiss()
  }

  const handleConfirm = async () => {
    if (submitting || selected.length === 0) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await session.onAdd(selected)
      if (result !== false) {
        closeModelDiscovery(session.id)
        dismiss()
      }
    } catch (error) {
      setSubmitError(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const confirmPress = () => {
    void handleConfirm()
  }

  return (
    <>
      <ModelDiscoveryIosToolbar
        busy={submitting}
        canConfirm={selected.length > 0}
        onClose={handleClose}
        onConfirm={confirmPress}
      />
      <NativeView
        collapsable={false}
        testID="model-discovery-sheet"
        style={{ flex: 1, backgroundColor: palette.background }}
      >
        <ModelDiscoveryAndroidHeader
          busy={submitting}
          canConfirm={selected.length > 0}
          onClose={handleClose}
          onConfirm={confirmPress}
        />

        <FlatList
          testID="model-discovery-list"
          data={rows}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(bottomInset, 24),
          }}
          ListHeaderComponent={
            <ModelDiscoveryListHeader
              submitError={submitError}
              showSearch={totalCount >= SEARCH_THRESHOLD}
              query={query}
              availableCount={availableCount}
              filteredAvailableCount={filteredAvailableIds.length}
              selectedCount={selected.length}
              allVisibleSelected={allVisibleSelected}
              busy={submitting}
              onQueryChange={setQuery}
              onToggleSelectAll={toggleSelectAll}
            />
          }
          ListEmptyComponent={
            query.trim() ? (
              <Text
                className="py-8 text-center text-base"
                style={{ color: palette.textMuted }}
              >
                {t("providerEditor.noMatchingModels")}
              </Text>
            ) : null
          }
          renderItem={({ item, index }) => (
            <View
              style={[
                index === 0 && {
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  borderTopWidth: 1,
                },
                index === rows.length - 1 && {
                  borderBottomLeftRadius: 20,
                  borderBottomRightRadius: 20,
                  borderBottomWidth: 1,
                },
                {
                  borderLeftWidth: 1,
                  borderRightWidth: 1,
                  borderColor: palette.border,
                  overflow: "hidden",
                },
              ]}
            >
              <ModelDiscoveryRow
                item={item}
                checked={selectedSet.has(item.id)}
                busy={submitting}
                isLast={index === rows.length - 1}
                onToggle={toggle}
              />
            </View>
          )}
        />
      </NativeView>
    </>
  )
}
