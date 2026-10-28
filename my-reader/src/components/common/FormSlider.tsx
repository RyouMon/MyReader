import Slider from "@mui/material/Slider"
import { useEffect, useId, useState, type CSSProperties } from "react"
import { Label } from "@/components/ui/label"

type FormSliderProps = {
  id?: string
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  themeStyle?: CSSProperties
  formatValue: (value: number) => string
  onCommit: (value: number) => void
}

export function FormSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  disabled,
  themeStyle,
  formatValue,
  onCommit,
}: FormSliderProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <section style={themeStyle}>
      <div className="flex items-center justify-between gap-3">
        <Label
          id={`${fieldId}-label`}
          htmlFor={fieldId}
          className="text-sm font-normal"
        >
          {label}
        </Label>
        <span
          className="text-sm tabular-nums text-muted-foreground"
          aria-hidden
        >
          {formatValue(draft)}
        </span>
      </div>
      <Slider
        value={draft}
        min={min}
        max={max}
        step={step}
        shiftStep={step * 10}
        disabled={disabled}
        aria-labelledby={`${fieldId}-label`}
        getAriaValueText={formatValue}
        slotProps={{ input: { id: fieldId } }}
        onChange={(_, next) => setDraft(next)}
        onChangeCommitted={(_, next) => {
          if (next !== value) onCommit(next)
        }}
      />
    </section>
  )
}
