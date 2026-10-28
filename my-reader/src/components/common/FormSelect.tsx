import {
  Children,
  Fragment,
  isValidElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import TextField, { type TextFieldProps } from "@mui/material/TextField"
import { Field, FieldLabel } from "@/components/ui/field"

export { default as FormSelectItem } from "@mui/material/MenuItem"

type FormSelectProps = Omit<
  TextFieldProps,
  "select" | "children" | "value" | "onChange" | "slotProps"
> & {
  value?: string
  labelMode?: "floating" | "hidden" | "external"
  onValueChange: (value: string) => void
  children: ReactNode
  themeStyle?: CSSProperties
}

function menuItems(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? menuItems(child.props.children)
      : [child],
  )
}

export function FormSelect({
  id,
  label,
  labelMode = "floating",
  value = "",
  onValueChange,
  children,
  themeStyle,
  style,
  "aria-label": ariaLabel,
  ...props
}: FormSelectProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const labelId =
    label && labelMode !== "floating" ? `${fieldId}-label` : undefined
  const root = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<HTMLDivElement | null>(null)
  const [openAbove, setOpenAbove] = useState(false)
  useLayoutEffect(() => {
    if (!menu) return
    const updatePlacement = () => {
      const control = root.current?.querySelector('[role="combobox"]')
      if (!control) return
      const { top, bottom } = control.getBoundingClientRect()
      const spaceBelow = window.innerHeight - bottom
      setOpenAbove(menu.offsetHeight > spaceBelow && top > spaceBelow)
    }
    updatePlacement()
    window.addEventListener("resize", updatePlacement)
    return () => window.removeEventListener("resize", updatePlacement)
  }, [menu, children])
  const control = (
    <TextField
      fullWidth
      {...props}
      label={labelMode === "floating" ? label : undefined}
      style={{ ...themeStyle, ...style }}
      ref={root}
      id={fieldId}
      select
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      slotProps={{
        select: {
          ...(labelId ? { labelId } : {}),
          "aria-label": ariaLabel,
          MenuProps: {
            container: () => root.current?.closest('[role="dialog"]') ?? null,
            disableScrollLock: true,
            anchorOrigin: {
              vertical: openAbove ? "top" : "bottom",
              horizontal: "left",
            },
            transformOrigin: {
              vertical: openAbove ? "bottom" : "top",
              horizontal: "left",
            },
            marginThreshold: 0,
            slotProps: { paper: { ref: setMenu } },
            style: themeStyle,
          },
        },
      }}
    >
      {menuItems(children)}
    </TextField>
  )
  if (labelMode === "external") {
    return (
      <Field
        data-disabled={props.disabled}
        data-invalid={props.error}
        style={themeStyle}
      >
        <FieldLabel id={labelId} htmlFor={fieldId}>
          {label}
        </FieldLabel>
        {control}
      </Field>
    )
  }
  return (
    <>
      {labelMode === "hidden" && label ? (
        <span id={labelId} className="sr-only">
          {label}
        </span>
      ) : null}
      {control}
    </>
  )
}
