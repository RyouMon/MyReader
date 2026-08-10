import type { LucideIcon } from "lucide-react"
import myReaderIconUrl from "@/assets/myreader-library-icon.png"
import calibreIconUrl from "@/assets/third-party/calibre-library-icon.png"
import { LocalStorageIcon } from "@/components/common/LocalStorageIcon"
import { OneDriveCloudIcon } from "@/components/common/OneDriveCloudIcon"
import { WebdavServerIcon } from "@/components/common/WebdavServerIcon"
import { cn } from "@/lib/utils"

export type EntityIconKind =
  | "myreaderLibrary"
  | "calibreLibrary"
  | "localDataSource"
  | "webdavDataSource"
  | "onedriveDataSource"

const ENTITY_ICONS: Partial<Record<EntityIconKind, LucideIcon>> = {
  localDataSource: LocalStorageIcon,
  webdavDataSource: WebdavServerIcon,
  onedriveDataSource: OneDriveCloudIcon,
}

interface EntityIconProps {
  kind: EntityIconKind
  label: string
  variant?: "row" | "inline"
  className?: string
}

/**
 * Identifies library and data-source kinds without relying on visible text
 * badges. Libraries use their respective artwork; data sources use interface
 * symbols until provider artwork is available.
 */
export function EntityIcon({
  kind,
  label,
  variant = "row",
  className,
}: EntityIconProps) {
  const Icon = ENTITY_ICONS[kind]
  const row = variant === "row"
  const imageUrl =
    kind === "myreaderLibrary"
      ? myReaderIconUrl
      : kind === "calibreLibrary"
        ? calibreIconUrl
        : null

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-entity-icon={kind}
      className={cn(
        "shrink-0 items-center justify-center",
        row ? "flex size-8 rounded-md" : "inline-flex size-4",
        imageUrl
          ? "overflow-hidden"
          : row
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground",
        className,
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={cn(
            row ? "size-8" : "size-4",
            kind === "myreaderLibrary" && "rounded-[3px]",
          )}
        />
      ) : Icon ? (
        <Icon aria-hidden="true" className={row ? "size-4" : "size-3.5"} />
      ) : null}
    </span>
  )
}
