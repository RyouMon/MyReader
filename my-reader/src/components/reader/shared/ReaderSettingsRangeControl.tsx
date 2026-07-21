import { type CSSProperties, useEffect, useState } from "react"
import { Label } from "@/components/ui/label"

type ReaderSettingsRangeControlProps = {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  className: string
  labelClassName: string
  valueClassName: string
  formatValue: (value: number) => string
  rangeStyle: (value: number, min: number, max: number) => CSSProperties
  onCommit: (value: number) => void
}

export function ReaderSettingsRangeControl({
  id,
  label,
  value,
  min,
  max,
  step,
  className,
  labelClassName,
  valueClassName,
  formatValue,
  rangeStyle,
  onCommit,
}: ReaderSettingsRangeControlProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = (nextValue: number) => {
    setDraft(nextValue)
    if (nextValue !== value) onCommit(nextValue)
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className={labelClassName}>
          {label}
        </Label>
        <Label htmlFor={id} className={valueClassName}>
          {formatValue(draft)}
        </Label>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.valueAsNumber)}
        onPointerUp={(event) => commit(event.currentTarget.valueAsNumber)}
        onPointerCancel={(event) => commit(event.currentTarget.valueAsNumber)}
        onKeyUp={(event) => commit(event.currentTarget.valueAsNumber)}
        onBlur={(event) => commit(event.currentTarget.valueAsNumber)}
        className={className}
        style={rangeStyle(draft, min, max)}
      />
    </section>
  )
}
