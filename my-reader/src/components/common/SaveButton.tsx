import { Loader2, Save } from "lucide-react"
import type { ComponentPropsWithoutRef } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

type SaveButtonProps = Omit<
  ComponentPropsWithoutRef<typeof Button>,
  "children" | "asChild"
> & {
  saving?: boolean
}

export function SaveButton({
  saving = false,
  disabled,
  type = "submit",
  size = "sm",
  ...props
}: SaveButtonProps) {
  const { t } = useTranslation()
  return (
    <Button
      {...props}
      type={type}
      size={size}
      disabled={disabled || saving}
      aria-busy={saving}
    >
      {saving ? (
        <Loader2 data-icon="inline-start" className="animate-spin" />
      ) : (
        <Save data-icon="inline-start" />
      )}
      {t("common.save")}
    </Button>
  )
}
