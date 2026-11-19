import type { DesktopTranslationKey } from "@my-reader/i18n/desktop"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  FlowDialogChoice,
  FlowDialogContent,
  FlowDialogHeader,
} from "@/components/common/FlowDialog"
import { OneDriveCloudIcon } from "@/components/common/OneDriveCloudIcon"
import { DropboxIcon } from "@/components/common/DropboxIcon"
import { GoogleDriveIcon } from "@/components/common/GoogleDriveIcon"
import { S3StorageIcon } from "@/components/common/S3StorageIcon"
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

function titleKey(sourceType: CreatableDataSourceType) {
  const titles: Record<CreatableDataSourceType, DesktopTranslationKey> = {
    webdav: "addLibraryFlow.addWebdav.title",
    onedrive: "addLibraryFlow.addOnedrive.title",
    gdrive: "addDataSourceForm.typeGdrive",
    dropbox: "addDataSourceForm.typeDropbox",
    s3: "addDataSourceForm.typeS3",
  }
  return titles[sourceType]
}

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
      : t(titleKey(step.sourceType))

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
              <FlowDialogChoice
                icon={GoogleDriveIcon}
                title={t("addDataSourceForm.typeGdrive")}
                description={t("addDataSourceForm.typeGdriveDesc")}
                onClick={() => setStep({ kind: "form", sourceType: "gdrive" })}
              />
              <FlowDialogChoice
                icon={DropboxIcon}
                title={t("addDataSourceForm.typeDropbox")}
                description={t("addDataSourceForm.typeDropboxDesc")}
                onClick={() => setStep({ kind: "form", sourceType: "dropbox" })}
              />
              <FlowDialogChoice
                icon={S3StorageIcon}
                title={t("addDataSourceForm.typeS3")}
                description={t("addDataSourceForm.typeS3Desc")}
                onClick={() => setStep({ kind: "form", sourceType: "s3" })}
              />
            </div>
          ) : (
            <AddDataSourceForm
              key={step.sourceType}
              type={step.sourceType}
              fillAvailableHeight
              onCreateDataSource={createDataSource}
              onCreated={closeDialog}
            />
          )}
        </div>
      </FlowDialogContent>
    </Dialog>
  )
}
