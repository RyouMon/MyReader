import { Check } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

export type DataSourceType = "local" | "webdav"

interface DataSourceTypeSelectorProps {
  value: DataSourceType
  onChange: (type: DataSourceType) => void
  disabled?: boolean
}

export function DataSourceTypeSelector({
  value,
  onChange,
  disabled,
}: DataSourceTypeSelectorProps) {
  const { t } = useTranslation()

  const types: {
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
        >
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
      ),
      title: t("addLibraryForm.typeLocal"),
      desc: t("addLibraryForm.typeLocalDesc"),
      iconBg: "bg-muted",
      iconColor: "text-muted-foreground",
      selectedIconBg: "bg-muted",
      selectedIconColor: "text-foreground",
    },
    {
      key: "webdav",
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
        >
          <path d="M17.5 19H9a7 7 0 1 0 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </svg>
      ),
      title: t("addLibraryForm.typeWebdav"),
      desc: t("addLibraryForm.typeWebdavDesc"),
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      selectedIconBg: "bg-primary/15",
      selectedIconColor: "text-primary",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {types.map((type) => {
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
                "flex size-10 shrink-0 items-center justify-center rounded-[10px]",
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
                isSelected
                  ? "border-primary bg-primary"
                  : "border-border",
              )}
            >
              {isSelected && <Check className="size-2.5 text-primary-foreground" />}
            </div>
          </button>
        )
      })}
    </div>
  )
}