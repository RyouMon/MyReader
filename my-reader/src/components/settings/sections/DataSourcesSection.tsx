import type { DataSource } from "@my-reader/tools/types/data-source"
import { Unplug } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AddPanelButton } from "@/components/common/AddPanelButton"
import { AppRow } from "@/components/common/AppRow"
import { RowActions } from "@/components/common/RowActions"
import { EntityIcon, type EntityIconKind } from "@/components/common/EntityIcon"
import { GroupList, GroupListItem } from "@/components/common/GroupList"
import { SectionHeader } from "@/components/common/SectionHeader"
import { AddDataSourceDialog } from "@/components/settings/AddDataSourceDialog"
import {
  useDataSourceMutations,
  useDataSourcesQuery,
} from "@/hooks/queries/useDataSourcesQuery"

export default function DataSourcesSection() {
  const { t } = useTranslation()
  const { data: dataSources = [] } = useDataSourcesQuery()
  const { deleteDataSource } = useDataSourceMutations()

  const [addDataSourceOpen, setAddDataSourceOpen] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-7 py-5 pb-4">
        <h1 className="text-xl font-semibold">
          {t("settings.dataSources.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.dataSources.description")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-5">
        <section className="mb-5">
          <SectionHeader title={t("settings.dataSources.configured")} />

          <GroupList>
            <LocalStorageStaticRow />
            {dataSources.map((source) => (
              <DataSourceCard
                key={source.id}
                source={source}
                onDelete={deleteDataSource}
              />
            ))}
          </GroupList>
        </section>

        <div className="overflow-hidden rounded-lg border border-dashed border-border">
          <AddPanelButton
            label={t("addDataSourceForm.label")}
            onClick={() => setAddDataSourceOpen(true)}
          />
        </div>
      </div>

      <AddDataSourceDialog
        open={addDataSourceOpen}
        onOpenChange={setAddDataSourceOpen}
      />
    </div>
  )
}

function LocalStorageStaticRow() {
  const { t } = useTranslation()
  return (
    <GroupListItem>
      <AppRow
        head={
          <EntityIcon
            kind="localDataSource"
            label={t("addLibraryForm.typeLocal")}
          />
        }
        body={t("constants.localDataSourceName")}
        detail={t("settings.dataSources.localDetail")}
        detailClassName="font-mono"
      />
    </GroupListItem>
  )
}

interface DataSourceCardProps {
  source: DataSource
  onDelete: (id: string) => Promise<void>
}

function DataSourceCard({ source, onDelete }: DataSourceCardProps) {
  const { t } = useTranslation()
  let bodyText = source.name
  let secondaryText: string | undefined
  let iconKind: EntityIconKind = "webdavDataSource"
  let iconLabel = t("addLibraryForm.typeWebdav")

  switch (source.type) {
    case "webdav":
      secondaryText = `${source.endpoint} · ${source.username}`
      break
    case "onedrive":
      iconKind = "onedriveDataSource"
      iconLabel = t("addDataSourceForm.typeOnedrive")
      bodyText = source.displayName || source.name || "OneDrive"
      secondaryText = source.email || undefined
      break
  }

  return (
    <GroupListItem>
      <AppRow
        head={<EntityIcon kind={iconKind} label={iconLabel} />}
        body={bodyText}
        detail={secondaryText}
        detailClassName="font-mono"
        actions={
          source.readonly ? (
            <div className="flex size-[30px] items-center justify-center rounded-md text-muted-foreground">
              <Unplug className="size-3.5" />
            </div>
          ) : (
            <RowActions name={bodyText} onDelete={() => onDelete(source.id)} />
          )
        }
      />
    </GroupListItem>
  )
}
