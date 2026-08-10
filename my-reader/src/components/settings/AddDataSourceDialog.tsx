import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  FlowDialogChoice,
  FlowDialogContent,
  FlowDialogHeader,
} from "@/components/common/FlowDialog"
import { OneDriveCloudIcon } from "@/components/common/OneDriveCloudIcon"
import { WebdavServerIcon } from "@/components/common/WebdavServerIcon"
import {
  AddDataSourceForm,
  type CreatableDataSourceType,
} from "@/components/settings/forms/AddDataSourcePanel"
import { Dialog } from "@/components/ui/dialog"
import { useDataSourceMutations } from "@/hooks/queries/useDataSourcesQuery"

type AddDataSourceStep =
  | { kind: "chooseType" }
  | { kind: "form"; sourceType: CreatableDataSourceType }

interface AddDataSourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddDataSourceDialog({
  open,
  onOpenChange,
}: AddDataSourceDialogProps) {
  const { t } = useTranslation()
  const { createDataSource } = useDataSourceMutations()
  const [step, setStep] = useState<AddDataSourceStep>({ kind: "chooseType" })

  useEffect(() => {
    if (open) setStep({ kind: "chooseType" })
  }, [open])

  function closeDialog() {
    setStep({ kind: "chooseType" })
    onOpenChange(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setStep({ kind: "chooseType" })
    onOpenChange(nextOpen)
  }

  const title =
    step.kind === "chooseType"
      ? t("addDataSourceForm.label")
      : step.sourceType === "webdav"
        ? t("addLibraryFlow.addWebdav.title")
        : t("addLibraryFlow.addOnedrive.title")

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <FlowDialogContent aria-describedby={undefined}>
        <FlowDialogHeader
          title={title}
          onBack={
            step.kind === "form"
              ? () => setStep({ kind: "chooseType" })
              : undefined
          }
          backLabel={t("common.back")}
          closeLabel={t("common.close")}
          showCloseButton
        />

        <div className="min-h-0 overflow-hidden px-6 py-5">
          {step.kind === "chooseType" ? (
            <div className="grid gap-3">
              <FlowDialogChoice
                icon={WebdavServerIcon}
                title={t("addLibraryFlow.addWebdav.title")}
                onClick={() => setStep({ kind: "form", sourceType: "webdav" })}
              />
              <FlowDialogChoice
                icon={OneDriveCloudIcon}
                title={t("addLibraryFlow.addOnedrive.title")}
                onClick={() =>
                  setStep({ kind: "form", sourceType: "onedrive" })
                }
              />
            </div>
          ) : (
            <AddDataSourceForm
              key={step.sourceType}
              type={step.sourceType}
              fillAvailableHeight
              autoStartOnedriveAuth={step.sourceType === "onedrive"}
              onCreateDataSource={createDataSource}
              onCreated={closeDialog}
            />
          )}
        </div>
      </FlowDialogContent>
    </Dialog>
  )
}
