import { Check } from "lucide-react"
import { useTranslation } from "react-i18next"
import { LocalStorageIcon } from "@/components/common/LocalStorageIcon"
import { WebdavServerIcon } from "@/components/common/WebdavServerIcon"
import { cn } from "@/lib/utils"

export type DataSourceType = "local" | "webdav" | "onedrive"

interface DataSourceTypeSelectorProps {
  value: DataSourceType
  onChange: (type: DataSourceType) => void
  disabled?: boolean
  types?: readonly DataSourceType[]
}

export function DataSourceTypeSelector({
  value,
  onChange,
  disabled,
  types,
}: DataSourceTypeSelectorProps) {
  const { t } = useTranslation()

  const options: {
    key: DataSourceType
    icon: React.ReactNode
    title: string
    desc: string
    iconBg: string
    iconColor: string
    selectedIconBg: string
    selectedIconColor: string
  }[] = [
    {
      key: "local",
      icon: <LocalStorageIcon size={20} aria-hidden="true" focusable="false" />,
      title: t("addLibraryForm.typeLocal"),
      desc: t("addLibraryForm.typeLocalDesc"),
      iconBg: "bg-muted",
      iconColor: "text-data-source-local",
      selectedIconBg: "bg-accent",
      selectedIconColor: "text-data-source-local",
    },
    {
      key: "webdav",
      icon: <WebdavServerIcon size={20} aria-hidden="true" focusable="false" />,
      title: t("addLibraryForm.typeWebdav"),
      desc: t("addLibraryForm.typeWebdavDesc"),
      iconBg: "bg-card",
      iconColor: "text-data-source-webdav",
      selectedIconBg: "bg-accent",
      selectedIconColor: "text-data-source-webdav",
    },
    {
      key: "onedrive",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
      ),
      title: t("addDataSourceForm.typeOnedrive"),
      desc: t("addDataSourceForm.typeOnedriveDesc"),
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
      selectedIconBg: "bg-blue-500/15",
      selectedIconColor: "text-blue-500",
    },
  ]
  const visibleOptions = types
    ? options.filter((option) => types.includes(option.key))
    : options

  return (
    <div
      className={cn(
        "grid gap-2.5",
        visibleOptions.length === 2 ? "grid-cols-2" : "grid-cols-3",
      )}
    >
      {visibleOptions.map((type) => {
        const isSelected = value === type.key
        return (
          <button
            key={type.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(type.key)}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3.5 text-start transition-all cursor-pointer",
              "hover:border-primary/40 hover:bg-primary/[0.03]",
              isSelected
                ? "border-primary bg-primary/[0.05] shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_12%,transparent)]"
                : "border-border",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-lg",
                isSelected ? type.selectedIconBg : type.iconBg,
              )}
            >
              <div
                className={cn(
                  isSelected ? type.selectedIconColor : type.iconColor,
                )}
              >
                {type.icon}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium text-foreground">
                {type.title}
              </div>
              <div className="text-[11.5px] leading-snug text-muted-foreground">
                {type.desc}
              </div>
            </div>
            <div
              className={cn(
                "flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
                isSelected ? "border-primary bg-primary" : "border-border",
              )}
            >
              {isSelected && (
                <Check className="size-2.5 text-primary-foreground" />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
