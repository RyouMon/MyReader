import { useId, type ComponentProps, type ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

type FormSwitchProps = ComponentProps<typeof Switch> & {
  label: ReactNode
  description?: ReactNode
  align?: "end" | "between"
}

export function FormSwitch({
  id,
  label,
  description,
  align = "end",
  className,
  ...props
}: FormSwitchProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className={cn(
          "flex min-h-9 items-center gap-3",
          align === "between" ? "justify-between" : "justify-end",
        )}
      >
        <Label htmlFor={fieldId} className="text-sm font-normal">
          {label}
        </Label>
        <Switch
          {...props}
          id={fieldId}
          aria-describedby={description ? `${fieldId}-description` : undefined}
        />
      </div>
      {description ? (
        <p
          id={`${fieldId}-description`}
          className={cn(
            "text-sm text-muted-foreground",
            align === "between" ? "text-left" : "text-right",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}
