import {
  isTtsCredentialRequiredError,
  ttsProviderMeta,
} from "@my-reader/tools/tts-providers"
import { ttsVoiceNameKey } from "@my-reader/tools/tts-voice-names"
import {
  memo,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import {
  FlatList,
  KeyboardAvoidingView,
  View as NativeView,
  Platform,
} from "react-native"
import {
  Button,
  FormInputRow,
  FormSelect,
  FormSwitch,
  IconButton,
  SectionLabel,
} from "@/src/components"
import { useDismissSuggestions } from "@/src/components/ui/suggestions-overlay"
import type { useFormValidation } from "@/src/components/ui/use-form-validation"
import { useThemePalette } from "@/src/design/tokens"
import {
  mergeSharedVoices,
  mergeVoices,
  newTtsModel,
  setVoiceScope,
  type TtsProviderDraft,
  usesModelVoices,
} from "@/src/domain/tts/tts-provider-draft"
import { useTtsModelDiscovery } from "@/src/domain/tts/use-tts-model-discovery"
import { useTtsRemoval } from "@/src/domain/tts/use-tts-removal-confirmation"
import { appErrorKind } from "@/src/errors/kind"
import { errorMessage } from "@/src/i18n/error-message"
import type { MobileTtsModel, QwenTtsModel } from "@/src/services/core/tts"
import { Text, View } from "@/tw"
import {
  closeModelDiscovery,
  openModelDiscovery,
} from "./model-discovery-session"
import { ProviderTextField } from "./provider-text-field"
import {
  type TtsDraftUpdater,
  TtsVoiceRow,
  TtsVoicesError,
  TtsVoicesHeader,
  useTtsVoicesController,
} from "./tts-voices-editor"

const FETCH_ICON = { ios: "arrow.clockwise", android: "refresh" } as const
const ADD_ICON = { ios: "plus", android: "add" } as const
const EXPAND_OPEN_ICON = {
  ios: "chevron.down",
  android: "expand-more",
} as const
const EXPAND_CLOSED_ICON = {
  ios: "chevron.right",
  android: "chevron-right",
} as const
const TRASH_ICON = { ios: "trash", android: "delete-outline" } as const

const FORM_LIST_INITIAL_RENDER = 10
const FORM_LIST_BATCH_SIZE = 6
const FORM_LIST_BATCH_PERIOD_MS = 32
const FORM_LIST_WINDOW_SIZE = 5
const FORM_LIST_CONTENT_STYLE = {
  paddingHorizontal: 16,
  paddingTop: 16,
  paddingBottom: 40,
} as const

type TtsFormListItem =
  | {
      key: string
      type: "model"
      index: number
      modelId: string
      modelName: string
      open: boolean
      expandable: boolean
    }
  | {
      key: string
      type: "voices-header"
      group: string
      indented: boolean
    }
  | {
      key: string
      type: "voice"
      index: number
      group: string
      voice: string
      name: string
      fieldKey: string
      indented: boolean
      isLastIndented: boolean
    }
  | {
      key: string
      type: "voices-error"
      group: string
      message: string
      indented: boolean
    }
  | {
      key: string
      type: "shared-test-model"
    }

function appendVoiceItems(
  items: TtsFormListItem[],
  {
    group,
    voices,
    voiceNames,
    indented,
    previewError,
  }: {
    group: string
    voices: string[]
    voiceNames?: Record<string, string>
    indented: boolean
    previewError: string | null
  },
) {
  items.push({
    key: `voices-header:${group}`,
    type: "voices-header",
    group,
    indented,
  })
  const names = voiceNames ?? {}
  const lastIndex = voices.length - 1
  for (let i = 0; i < voices.length; i += 1) {
    const voice = voices[i]!
    items.push({
      key: `voice:${group}:${i}`,
      type: "voice",
      index: i,
      group,
      voice,
      name: names[ttsVoiceNameKey(voice, i)] ?? "",
      fieldKey: `${group}.voice.${i}`,
      indented,
      isLastIndented: indented && i === lastIndex && !previewError,
    })
  }
  if (previewError) {
    items.push({
      key: `voices-error:${group}`,
      type: "voices-error",
      group,
      message: previewError,
      indented,
    })
  }
}

function buildTtsFormListItems({
  models,
  voices,
  voiceNames,
  scoped,
  selected,
  previewError,
}: {
  models: MobileTtsModel[]
  voices: string[]
  voiceNames?: Record<string, string>
  scoped: boolean
  selected: number | null
  previewError: string | null
}): TtsFormListItem[] {
  const items: TtsFormListItem[] = []
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]!
    const open = scoped && selected === index
    items.push({
      key: `model:${model.id}`,
      type: "model",
      index,
      modelId: model.id,
      modelName: model.model,
      open,
      expandable: scoped,
    })
    if (open) {
      appendVoiceItems(items, {
        group: model.id,
        voices: model.voices,
        voiceNames: model.voiceNames,
        indented: true,
        previewError,
      })
    }
  }
  if (!scoped) {
    appendVoiceItems(items, {
      group: "shared",
      voices,
      voiceNames,
      indented: false,
      previewError,
    })
    if (models.length > 1) {
      items.push({
        key: "shared-test-model",
        type: "shared-test-model",
      })
    }
  }
  return items
}

const TtsModelRow = memo(function TtsModelRow({
  index,
  modelId,
  modelName,
  open,
  expandable,
  error,
  onSelect,
  onChange,
  onBlur,
  onRemove,
}: {
  index: number
  modelId: string
  modelName: string
  open: boolean
  expandable: boolean
  error?: string
  onSelect: (index: number, open: boolean) => void
  onChange: (index: number, model: string) => void
  onBlur: (fieldKey: string) => void
  onRemove: (index: number) => void
}) {
  const { t } = useTranslation()
  const name = modelName || t("aiProviders.newModel")

  const handleSelect = useCallback(
    () => onSelect(index, open),
    [index, onSelect, open],
  )
  const handleRemove = useCallback(
    () => void onRemove(index),
    [index, onRemove],
  )
  const handleChange = useCallback(
    (value: string) => onChange(index, value),
    [index, onChange],
  )
  const handleBlur = useCallback(() => onBlur(modelId), [modelId, onBlur])

  return (
    <View className="pb-3">
      <FormInputRow
        actions={
          <>
            {expandable ? (
              <IconButton
                label={`${t("providerEditor.modelDetails")} ${name}`}
                icon={open ? EXPAND_OPEN_ICON : EXPAND_CLOSED_ICON}
                size="sm"
                onPress={handleSelect}
              />
            ) : null}
            <IconButton
              label={`${t("aiProviders.removeModel")} ${name}`}
              icon={TRASH_ICON}
              tone="danger"
              size="sm"
              onPress={handleRemove}
            />
          </>
        }
      >
        <ProviderTextField
          label={t("providerEditor.modelId")}
          testID={`provider-model-id-${index}`}
          required
          value={modelName}
          error={error}
          onBlur={handleBlur}
          onChangeText={handleChange}
        />
      </FormInputRow>
    </View>
  )
})

const SharedTestModelRow = memo(function SharedTestModelRow({
  models,
  selectedModel,
  onSelect,
}: {
  models: MobileTtsModel[]
  selectedModel?: MobileTtsModel
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const actions = useMemo(
    () =>
      models.map((item) => ({
        id: item.id,
        title: item.model || t("aiProviders.newModel"),
        state: (item.id === selectedModel?.id ? "on" : "off") as "on" | "off",
      })),
    [models, selectedModel?.id, t],
  )
  return (
    <View className="pb-3">
      <FormSelect
        label={t("providerEditor.testModel")}
        value={selectedModel?.model || t("aiProviders.newModel")}
        actions={actions}
        onSelect={onSelect}
      />
    </View>
  )
})

const TtsProviderModelsHeader = memo(function TtsProviderModelsHeader({
  header,
  discoveryError,
  allowsCustomVoiceScope,
  scoped,
  discoverPending,
  busy,
  hasEndpoint,
  modelsError,
  onToggleScope,
  onFetchModels,
  onAddManualModel,
}: {
  header: ReactElement
  discoveryError: unknown
  allowsCustomVoiceScope: boolean
  scoped: boolean
  discoverPending: boolean
  busy: boolean
  hasEndpoint: boolean
  modelsError?: string
  onToggleScope: (value: boolean) => void
  onFetchModels: () => void
  onAddManualModel: () => void
}) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  return (
    <View className="gap-3 pb-3">
      {header}
      {discoveryError ? (
        <Text
          selectable
          accessibilityRole="alert"
          className="px-4 text-sm"
          style={{ color: palette.danger }}
        >
          {errorMessage(discoveryError)}
        </Text>
      ) : null}
      {allowsCustomVoiceScope ? (
        <FormSwitch
          label={t("aiProviders.modelScopedVoices")}
          value={scoped}
          onValueChange={onToggleScope}
        />
      ) : null}
      <View
        className="gap-3 border-t pt-3"
        style={{ borderColor: palette.border }}
      >
        <View className="flex-row items-center justify-between gap-2">
          <SectionLabel>{t("providerEditor.models")}</SectionLabel>
          <View className="flex-row items-center gap-1">
            <Button
              title={t("providerEditor.fetchModels")}
              icon={FETCH_ICON}
              variant="ghost"
              size="sm"
              loading={discoverPending}
              disabled={busy || !hasEndpoint}
              onPress={onFetchModels}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={ADD_ICON}
              title={t("aiProviders.addModel")}
              onPress={onAddManualModel}
            />
          </View>
        </View>
        {modelsError ? (
          <Text
            accessibilityRole="alert"
            className="px-4 text-sm"
            style={{ color: palette.danger }}
          >
            {modelsError}
          </Text>
        ) : null}
      </View>
    </View>
  )
})

const keyExtractor = (item: TtsFormListItem) => item.key

function TtsFormListShell({
  listRef,
  items,
  extraData,
  header,
  renderItem,
  onScrollToIndexFailed,
}: {
  listRef: React.RefObject<FlatList<TtsFormListItem> | null>
  items: TtsFormListItem[]
  extraData: unknown
  header: ReactElement
  renderItem: ({ item }: { item: TtsFormListItem }) => ReactElement | null
  onScrollToIndexFailed: () => void
}) {
  const palette = useThemePalette()
  const dismissSuggestions = useDismissSuggestions()
  const frame = useRef<NativeView>(null)
  const [keyboardOffset, setKeyboardOffset] = useState(0)

  const list = (
    <FlatList
      ref={listRef}
      testID="tts-provider-form-list"
      data={items}
      extraData={extraData}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={header}
      initialNumToRender={FORM_LIST_INITIAL_RENDER}
      maxToRenderPerBatch={FORM_LIST_BATCH_SIZE}
      updateCellsBatchingPeriod={FORM_LIST_BATCH_PERIOD_MS}
      windowSize={FORM_LIST_WINDOW_SIZE}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={dismissSuggestions}
      onScrollToIndexFailed={onScrollToIndexFailed}
      contentContainerStyle={FORM_LIST_CONTENT_STYLE}
      style={{ flex: 1, backgroundColor: palette.background }}
    />
  )

  if (Platform.OS !== "android") return list

  return (
    <NativeView
      ref={frame}
      style={{ flex: 1 }}
      onLayout={() => {
        frame.current?.measureInWindow((_x, y) => setKeyboardOffset(y))
      }}
    >
      <KeyboardAvoidingView
        behavior="height"
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        {list}
      </KeyboardAvoidingView>
    </NativeView>
  )
}

export function TtsProviderModels({
  header,
  draft,
  onUpdateDraft,
  onCredentialRequired,
  validation,
}: {
  header: ReactElement
  draft: TtsProviderDraft
  onUpdateDraft: TtsDraftUpdater
  onCredentialRequired?: () => void
  validation: ReturnType<typeof useFormValidation>
}) {
  const confirmRemoval = useTtsRemoval()
  const listRef = useRef<FlatList<TtsFormListItem> | null>(null)
  const [selected, setSelected] = useState<number | null>(0)
  const [sharedPreviewModelId, setSharedPreviewModelId] = useState(
    draft.models[0]?.id,
  )

  const invalidDetails = draft.models.findIndex(
    (model) =>
      validation.errorFor(`${model.id}.voices`) ||
      model.voices.some((_, i) =>
        validation.errorFor(`${model.id}.voice.${i}`),
      ),
  )
  useEffect(() => {
    if (invalidDetails >= 0) setSelected(invalidDetails)
  }, [invalidDetails])

  const { discover, voices: importing, fetchVoices } = useTtsModelDiscovery()
  const meta = ttsProviderMeta(draft.kind)
  const request = useRef<AbortController | null>(null)
  const activeDiscoverySession = useRef<number | null>(null)
  const identity = JSON.stringify([
    draft.id,
    draft.kind,
    draft.endpoint,
    draft.credential,
    draft.clearCredential,
  ])
  const current = useRef(draft)
  useEffect(() => {
    current.current = draft
  }, [draft])
  useEffect(() => {
    if (activeDiscoverySession.current !== null) {
      closeModelDiscovery(activeDiscoverySession.current)
      activeDiscoverySession.current = null
    }
    return () => request.current?.abort()
  }, [identity])
  useEffect(
    () => () => {
      if (activeDiscoverySession.current !== null) {
        closeModelDiscovery(activeDiscoverySession.current)
        activeDiscoverySession.current = null
      }
    },
    [],
  )

  const busy =
    discover.isPending || importing.isPending || fetchVoices.isPending
  const scoped = usesModelVoices(draft)
  const sharedPreviewModel =
    draft.models.find((item) => item.id === sharedPreviewModelId) ??
    draft.models[0]
  const activeModel = scoped
    ? selected !== null
      ? draft.models[selected]
      : undefined
    : sharedPreviewModel

  const startRequest = useCallback(() => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    return controller
  }, [])

  const handleCredentialError = useCallback(
    (error: unknown, reset: () => void) => {
      if (
        !isTtsCredentialRequiredError(
          error,
          current.current,
          appErrorKind(error),
        )
      )
        return
      reset()
      onCredentialRequired?.()
    },
    [onCredentialRequired],
  )

  const addDiscoveredModels = useCallback(
    async (
      ids: string[],
      discoveredOptions: { id: string; qwen?: QwenTtsModel }[],
    ) => {
      const controller = startRequest()
      const catalog = discoveredOptions.flatMap((option) =>
        option.qwen ? [option.qwen] : [],
      )
      try {
        const models = await importing.mutateAsync({
          draft: current.current,
          ids,
          catalog,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return true
        let nextSelected = 0
        onUpdateDraft((latest) => {
          const unique = models.filter(
            (model) =>
              !latest.models.some((old) => old.model.trim() === model.model),
          )
          const existing = latest.models.filter((model) => model.model.trim())
          nextSelected = existing.length
          return { ...latest, models: [...existing, ...unique] }
        })
        setSelected(nextSelected)
        return true
      } catch (error) {
        if (controller.signal.aborted) return true
        if (
          isTtsCredentialRequiredError(
            error,
            current.current,
            appErrorKind(error),
          )
        ) {
          importing.reset()
          onCredentialRequired?.()
          return true
        }
        throw error
      }
    },
    [importing, onCredentialRequired, onUpdateDraft, startRequest],
  )

  const handleFetchModels = useCallback(() => {
    const controller = startRequest()
    discover.mutate(
      { draft: current.current, signal: controller.signal },
      {
        onSuccess: (discoveredOptions) => {
          if (controller.signal.aborted) return
          const sessionId = openModelDiscovery({
            models: discoveredOptions,
            existing: current.current.models.map((model) => model.model),
            onAdd: (ids) => addDiscoveredModels(ids, discoveredOptions),
            onClose: () => {
              if (activeDiscoverySession.current === sessionId) {
                activeDiscoverySession.current = null
              }
            },
          })
          activeDiscoverySession.current = sessionId
        },
        onError: (error) => {
          if (!controller.signal.aborted)
            handleCredentialError(error, discover.reset)
        },
      },
    )
  }, [addDiscoveredModels, discover, handleCredentialError, startRequest])

  const handleAddManualModel = useCallback(() => {
    const latest = current.current
    const isScoped = usesModelVoices(latest)
    const model = {
      ...newTtsModel("", undefined, latest.kind),
      voices: isScoped ? [""] : [],
      responseFormat: ttsProviderMeta(latest.kind).defaultFormat,
    }
    const nextSelected = latest.models.length
    onUpdateDraft((prev) => ({ ...prev, models: [...prev.models, model] }))
    setSelected(nextSelected)
  }, [onUpdateDraft])

  const handleModelChange = useCallback(
    (index: number, model: string) => {
      onUpdateDraft((prev) => ({
        ...prev,
        models: prev.models.map((item, i) =>
          i === index ? { ...item, model } : item,
        ),
      }))
    },
    [onUpdateDraft],
  )

  const handleModelSelect = useCallback((index: number, open: boolean) => {
    setSelected(open ? null : index)
  }, [])

  const handleModelRemove = useCallback(
    async (index: number) => {
      const latest = current.current
      const removed = latest.models[index]
      if (!removed) return
      const next = {
        ...latest,
        models: latest.models.filter((_, i) => i !== index),
      }
      if (!(await confirmRemoval(next, removed.model))) return
      onUpdateDraft((prev) => ({
        ...prev,
        models: prev.models.filter((_, i) => i !== index),
      }))
      setSelected(null)
    },
    [confirmRemoval, onUpdateDraft],
  )

  const activeModelRef = useRef(activeModel)
  useEffect(() => {
    activeModelRef.current = activeModel
  }, [activeModel])

  const handleFetchVoices = useCallback(() => {
    const controller = startRequest()
    const latest = current.current
    const targetModel = activeModelRef.current
    if (usesModelVoices(latest)) {
      if (!targetModel) return
      fetchVoices.mutate(
        { draft: latest, model: targetModel, signal: controller.signal },
        {
          onSuccess: (discovered) => {
            if (controller.signal.aborted) return
            onUpdateDraft((prev) => ({
              ...prev,
              models: prev.models.map((model) =>
                model.id === targetModel.id && model.model === targetModel.model
                  ? mergeVoices(model, discovered)
                  : model,
              ),
            }))
          },
          onError: (error) => {
            if (!controller.signal.aborted)
              handleCredentialError(error, fetchVoices.reset)
          },
        },
      )
      return
    }
    fetchVoices.mutate(
      { draft: latest, model: targetModel, signal: controller.signal },
      {
        onSuccess: (discovered) => {
          if (controller.signal.aborted) return
          onUpdateDraft((prev) => mergeSharedVoices(prev, discovered))
        },
        onError: (error) => {
          if (!controller.signal.aborted)
            handleCredentialError(error, fetchVoices.reset)
        },
      },
    )
  }, [fetchVoices, handleCredentialError, onUpdateDraft, startRequest])

  const scrollAfterAddVoice = useCallback((nextVoiceIndex: number) => {
    if (nextVoiceIndex < FORM_LIST_INITIAL_RENDER - 2) return
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true })
    })
  }, [])

  const scrollToEndFallback = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: false })
  }, [])

  const voicesController = useTtsVoicesController({
    draft,
    activeModel,
    onUpdateDraft,
    onCredentialRequired,
    onAfterAddVoice: scrollAfterAddVoice,
  })

  const items = useMemo(
    () =>
      buildTtsFormListItems({
        models: draft.models,
        voices: draft.voices,
        voiceNames: draft.voiceNames,
        scoped,
        selected,
        previewError: voicesController.previewError,
      }),
    [
      draft.models,
      draft.voiceNames,
      draft.voices,
      scoped,
      selected,
      voicesController.previewError,
    ],
  )

  const canPreview = Boolean(activeModel?.model.trim() && draft.endpoint.trim())
  const canFetchVoices =
    meta.supportsVoiceDiscovery &&
    Boolean(draft.endpoint.trim()) &&
    (!scoped ||
      (selected !== null &&
        (draft.kind !== "qwen" || Boolean(activeModel?.model.trim()))))

  const previewLoading = voicesController.previewState !== "playing"

  const renderItem = useCallback(
    ({ item }: { item: TtsFormListItem }) => {
      switch (item.type) {
        case "model":
          return (
            <TtsModelRow
              index={item.index}
              modelId={item.modelId}
              modelName={item.modelName}
              open={item.open}
              expandable={item.expandable}
              error={validation.errorFor(item.modelId)}
              onSelect={handleModelSelect}
              onChange={handleModelChange}
              onBlur={validation.touch}
              onRemove={handleModelRemove}
            />
          )
        case "voices-header":
          return (
            <TtsVoicesHeader
              error={validation.errorFor(`${item.group}.voices`)}
              canFetch={canFetchVoices}
              fetchingVoices={fetchVoices.isPending}
              busy={busy}
              indented={item.indented}
              onFetchVoices={handleFetchVoices}
              onAddVoice={voicesController.onAddVoice}
            />
          )
        case "voice":
          return (
            <TtsVoiceRow
              index={item.index}
              voice={item.voice}
              name={item.name}
              fieldKey={item.fieldKey}
              error={validation.errorFor(item.fieldKey)}
              canPreview={canPreview}
              previewActive={voicesController.previewActive === item.index}
              previewLoading={previewLoading}
              indented={item.indented}
              isLastIndented={item.isLastIndented}
              onVoiceIdChange={voicesController.onVoiceIdChange}
              onVoiceNameChange={voicesController.onVoiceNameChange}
              onVoiceBlur={validation.touch}
              onPreviewToggle={voicesController.onPreviewToggle}
              onRemove={voicesController.onRemoveVoice}
            />
          )
        case "voices-error":
          return (
            <TtsVoicesError message={item.message} indented={item.indented} />
          )
        case "shared-test-model":
          return (
            <SharedTestModelRow
              models={draft.models}
              selectedModel={sharedPreviewModel}
              onSelect={setSharedPreviewModelId}
            />
          )
      }
    },
    [
      busy,
      canFetchVoices,
      canPreview,
      draft.models,
      fetchVoices.isPending,
      handleFetchVoices,
      handleModelChange,
      handleModelRemove,
      handleModelSelect,
      previewLoading,
      sharedPreviewModel,
      validation,
      voicesController.onAddVoice,
      voicesController.onPreviewToggle,
      voicesController.onRemoveVoice,
      voicesController.onVoiceIdChange,
      voicesController.onVoiceNameChange,
      voicesController.previewActive,
    ],
  )

  const extraData = useMemo(
    () => ({
      validation,
      canPreview,
      canFetchVoices,
      fetchingVoices: fetchVoices.isPending,
      busy,
      previewActive: voicesController.previewActive,
      previewState: voicesController.previewState,
      sharedPreviewModelId: sharedPreviewModel?.id,
    }),
    [
      busy,
      canFetchVoices,
      canPreview,
      fetchVoices.isPending,
      sharedPreviewModel?.id,
      validation,
      voicesController.previewActive,
      voicesController.previewState,
    ],
  )

  const handleToggleScope = useCallback(
    (value: boolean) => {
      onUpdateDraft((prev) => setVoiceScope(prev, value))
    },
    [onUpdateDraft],
  )

  const rawDiscoveryError =
    discover.error || importing.error || fetchVoices.error
  const discoveryError =
    rawDiscoveryError &&
    !isTtsCredentialRequiredError(
      rawDiscoveryError,
      draft,
      appErrorKind(rawDiscoveryError),
    )
      ? rawDiscoveryError
      : null

  const listHeader = (
    <TtsProviderModelsHeader
      header={header}
      discoveryError={discoveryError}
      allowsCustomVoiceScope={meta.allowsCustomVoiceScope}
      scoped={scoped}
      discoverPending={discover.isPending}
      busy={busy}
      hasEndpoint={Boolean(draft.endpoint.trim())}
      modelsError={validation.errorFor("models")}
      onToggleScope={handleToggleScope}
      onFetchModels={handleFetchModels}
      onAddManualModel={handleAddManualModel}
    />
  )

  return (
    <TtsFormListShell
      listRef={listRef}
      items={items}
      extraData={extraData}
      header={listHeader}
      renderItem={renderItem}
      onScrollToIndexFailed={scrollToEndFallback}
    />
  )
}
