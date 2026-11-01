import { Play, Square } from "lucide-react"
import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { FormSelect, FormSelectItem } from "./FormSelect"

type Props = Omit<
  ComponentProps<typeof FormSelect>,
  "children" | "renderValue" | "onMenuClose"
> & {
  options: { value: string; label: string }[]
  previewVoiceId: string | null
  onPreview: (voiceId: string) => void
  onStopPreview: () => void
}

export function VoiceSelect({
  options,
  previewVoiceId,
  onPreview,
  onStopPreview,
  ...props
}: Props) {
  const { t } = useTranslation()
  return (
    <FormSelect
      {...props}
      renderValue={(value) =>
        options.find((option) => option.value === value)?.label ?? String(value)
      }
      onMenuClose={onStopPreview}
    >
      {options.map(({ value, label }) => {
        const playing = value === previewVoiceId
        const action = t(
          playing
            ? "settings.speech.stopPreview"
            : "settings.speech.previewAction",
        )
        return (
          <FormSelectItem
            key={value}
            value={value}
            onKeyDown={(event) => {
              if (
                event.key === "Tab" &&
                !event.shiftKey &&
                event.target === event.currentTarget
              ) {
                event.preventDefault()
                event.stopPropagation()
                event.currentTarget.querySelector("button")?.focus()
              }
            }}
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-2 shrink-0"
              aria-label={`${action} · ${label}`}
              title={action}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter")
                  event.stopPropagation()
                if (event.key === "Tab" && event.shiftKey) {
                  event.preventDefault()
                  event.stopPropagation()
                  event.currentTarget
                    .closest<HTMLElement>('[role="option"]')
                    ?.focus()
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.currentTarget
                    .closest<HTMLElement>('[role="option"]')
                    ?.focus()
                }
              }}
              onClick={(event) => {
                event.stopPropagation()
                if (playing) onStopPreview()
                else onPreview(value)
              }}
            >
              {playing ? <Square /> : <Play />}
            </Button>
          </FormSelectItem>
        )
      })}
    </FormSelect>
  )
}
