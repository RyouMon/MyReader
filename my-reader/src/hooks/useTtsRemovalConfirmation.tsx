import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ttsModelVoices,
  ttsUsageMessage,
  type TtsVoiceCatalog,
} from "@my-reader/tools/tts-selection-usage"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { api } from "@/lib/tauri-api"
import { errorMessage } from "@/lib/error-presentation"

type ConfirmRemoval = (
  provider: TtsVoiceCatalog,
  name?: string,
) => Promise<boolean>
export const TtsRemovalContext = createContext<ConfirmRemoval>(async () => true)
export const useTtsRemoval = () => useContext(TtsRemovalContext)

export function useTtsRemovalConfirmation() {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState<{
    title: string
    message: string
    error?: boolean
  } | null>(null)
  const resolve = useRef<(confirmed: boolean) => void>(undefined)
  const accepted = useRef("")
  const generation = useRef(0)
  const pending = useRef(false)
  useEffect(
    () => () => {
      generation.current += 1
      resolve.current?.(false)
    },
    [],
  )
  const finish = (confirmed: boolean) => {
    resolve.current?.(confirmed)
    resolve.current = undefined
    setPrompt(null)
  }
  const confirm: ConfirmRemoval = async (provider, name) => {
    if (!provider.id) return true
    if (pending.current) return false
    pending.current = true
    const current = generation.current
    try {
      const usages = await api.getTtsChangeUsage(
        provider.id,
        ttsModelVoices(provider),
      )
      if (current !== generation.current) return false
      const signature = JSON.stringify(usages)
      if (!usages.length || signature === accepted.current) return true
      const result = await new Promise<boolean>((done) => {
        resolve.current = done
        setPrompt({
          title: name
            ? t("rowActions.confirmDelete", { name })
            : t("ttsRemoval.confirm"),
          message: ttsUsageMessage(usages, t),
        })
      })
      if (result) accepted.current = signature
      return result
    } catch (error) {
      if (current !== generation.current) return false
      setPrompt({
        title: t("ttsRemoval.confirm"),
        message: errorMessage(error),
        error: true,
      })
      return false
    } finally {
      pending.current = false
    }
  }
  const dialog = (
    <Dialog
      open={!!prompt}
      onOpenChange={(open) => {
        if (!open) finish(false)
      }}
    >
      <DialogContent
        role="alertdialog"
        aria-describedby={undefined}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{prompt?.title}</DialogTitle>
        </DialogHeader>
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm">
          {prompt?.message}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => finish(false)}>
            {t(prompt?.error ? "common.close" : "common.cancel")}
          </Button>
          {!prompt?.error ? (
            <Button variant="destructive" onClick={() => finish(true)}>
              {t("common.confirm")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  return {
    confirm,
    dialog,
    reset: () => {
      accepted.current = ""
      generation.current += 1
      finish(false)
    },
  }
}
