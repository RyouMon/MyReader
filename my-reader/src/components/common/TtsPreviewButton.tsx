import { Play, Square } from "lucide-react"
import type { ComponentPropsWithoutRef } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

type TtsPreviewButtonProps = Omit<
  ComponentPropsWithoutRef<typeof Button>,
  "children" | "asChild"
> & { previewing: boolean }

export function TtsPreviewButton({
  previewing,
  variant = "ghost",
  size = "sm",
  ...props
}: TtsPreviewButtonProps) {
  const { t } = useTranslation()
  return (
    <Button {...props} type="button" variant={variant} size={size}>
      {previewing ? (
        <Square data-icon="inline-start" />
      ) : (
        <Play data-icon="inline-start" />
      )}
      {t(
        previewing
          ? "settings.speech.stopPreview"
          : "settings.speech.previewAction",
      )}
    </Button>
  )
}
