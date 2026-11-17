import { appendRemotePathSegment } from "@my-reader/tools/remote-path"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, FormTextField, IconButton } from "@/src/components"
import { PlatformIcon } from "@/src/components/ui/platform-icon"
import { useThemePalette } from "@/src/design/tokens"
import type { RemoteDirectoryEntry } from "@/src/services/core/remote"
import { View } from "@/tw"

export function NewRemoteFolderButton({
  enabled,
  disabled,
  onPress,
}: {
  enabled: boolean
  disabled: boolean
  onPress: () => void
}) {
  const { t } = useTranslation()
  if (!enabled) return null
  return (
    <Button
      className="self-start"
      title={t("remoteFolder.create")}
      icon={{ ios: "folder.badge.plus", android: "create-new-folder" }}
      variant="ghost"
      disabled={disabled}
      onPress={onPress}
    />
  )
}

export function RemoteFolderCreationForm({
  currentPath,
  disabled,
  creating,
  error,
  onCreate,
  onCreated,
  onCancel,
}: {
  currentPath: string
  disabled: boolean
  creating: boolean
  error: string | null
  onCreate: (name: string) => Promise<RemoteDirectoryEntry | null>
  onCreated: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const [name, setName] = useState("")
  const trimmed = name.trim()
  const invalid =
    Boolean(trimmed) && !appendRemotePathSegment(currentPath, trimmed)
  const message = error?.includes("REMOTE_DIRECTORY_ALREADY_EXISTS")
    ? t("remoteFolder.exists")
    : error
  async function create() {
    if (disabled || creating || invalid || !trimmed) return
    const entry = await onCreate(trimmed)
    if (entry) {
      onCreated()
    }
  }
  return (
    <View className="flex-row items-start gap-1 px-4 py-2">
      <View className="py-3 pr-2">
        <PlatformIcon
          name={{ ios: "folder.fill", android: "folder" }}
          size={24}
          color={palette.primary}
        />
      </View>
      <View className="flex-1">
        <FormTextField
          label={t("remoteFolder.name")}
          labelMode="hidden"
          placeholder={t("remoteFolder.name")}
          value={name}
          onChangeText={setName}
          editable={!disabled && !creating}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          error={invalid ? t("remoteFolder.invalid") : (message ?? undefined)}
          onSubmitEditing={() => void create()}
        />
      </View>
      <IconButton
        label={t(creating ? "remoteFolder.creating" : "common.confirm")}
        icon={{ ios: "checkmark", android: "check" }}
        tone="primary"
        loading={creating}
        disabled={disabled || creating || !trimmed || invalid}
        onPress={() => void create()}
      />
      <IconButton
        label={t("common.cancel")}
        icon={{ ios: "xmark", android: "close" }}
        disabled={creating}
        onPress={onCancel}
      />
    </View>
  )
}
