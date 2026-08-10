import type { DataSource } from "@my-reader/tools/types/data-source"
import { Trash2, Unplug } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AddPanelButton } from "@/components/common/AddPanelButton"
import { AppRow } from "@/components/common/AppRow"
import { EntityIcon, type EntityIconKind } from "@/components/common/EntityIcon"
import { GroupList, GroupListItem } from "@/components/common/GroupList"
import { SectionHeader } from "@/components/common/SectionHeader"
import { AddDataSourceDialog } from "@/components/settings/AddDataSourceDialog"
import {
  useDataSourceMutations,
  useDataSourcesQuery,
} from "@/hooks/queries/useDataSourcesQuery"
import { cn } from "@/lib/utils"

export default function DataSourcesSection() {
  const { t } = useTranslation()
  const { data: dataSources = [] } = useDataSourcesQuery()
  const { deleteDataSource } = useDataSourceMutations()

  const [addDataSourceOpen, setAddDataSourceOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    const target = dataSources.find((item) => item.id === id)
    if (target?.readonly) return

    if (pendingDeleteId === id) {
      setPendingDeleteId(null)
      setRemovingId(id)
      try {
        await deleteDataSource(id)
      } finally {
        setRemovingId(null)
      }
      return
    }

    setPendingDeleteId(id)
  }

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
                isPendingDelete={pendingDeleteId === source.id}
                isRemoving={removingId === source.id}
                onDelete={handleDelete}
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
    <GroupListItem className="transition-[opacity,transform,background-color] hover:bg-accent">
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
  isPendingDelete: boolean
  isRemoving: boolean
  onDelete: (id: string) => Promise<void>
}

function DataSourceCard({
  source,
  isPendingDelete,
  isRemoving,
  onDelete,
}: DataSourceCardProps) {
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
    <GroupListItem
      className={cn(
        "transition-[opacity,transform,background-color] hover:bg-accent",
        isRemoving &&
          "pointer-events-none ltr:translate-x-2 rtl:-translate-x-2 opacity-0",
      )}
    >
      <AppRow
        head={<EntityIcon kind={iconKind} label={iconLabel} />}
        body={bodyText}
        detail={secondaryText}
        detailClassName="font-mono"
        tail={
          isPendingDelete && !source.readonly ? (
            <span className="hidden text-[11px] text-destructive md:inline">
              {t("settings.dataSources.confirmDelete")}
            </span>
          ) : undefined
        }
        actions={
          source.readonly ? (
            <div className="flex size-[30px] items-center justify-center rounded-md text-muted-foreground">
              <Unplug className="size-3.5" />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void onDelete(source.id)}
              className={cn(
                "flex size-[30px] items-center justify-center rounded-md border transition-colors",
                isPendingDelete
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-transparent text-muted-foreground hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive",
              )}
              title={t("settings.dataSources.deleteTitle")}
            >
              <Trash2 className="size-3.5" />
            </button>
          )
        }
      />
    </GroupListItem>
  )
}
