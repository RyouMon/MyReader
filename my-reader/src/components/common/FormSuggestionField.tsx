import Autocomplete from "@mui/material/Autocomplete"
import type { TextFieldProps } from "@mui/material/TextField"
import {
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import { FormTextField } from "@/components/common/FormTextField"

export type FormSuggestionOption = {
  label: string
  value: string
}

type FormSuggestionFieldProps = Omit<TextFieldProps, "value" | "onChange"> & {
  value: string
  onValueChange: (value: string) => void
  suggestions: readonly FormSuggestionOption[]
  suggestionsLabel?: string
  themeStyle?: CSSProperties
}

const MATERIAL_INPUT_PADDING = "calc((var(--spacing) * 9 - 1lh) / 2)"

export function FormSuggestionField({
  id,
  value,
  onValueChange,
  suggestions,
  suggestionsLabel,
  themeStyle,
  ...textFieldProps
}: FormSuggestionFieldProps) {
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const popupOpen = open && !value.trim() && suggestions.length > 0

  useEffect(() => {
    if (!popupOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [popupOpen])

  if (!suggestions.length) {
    return (
      <FormTextField
        {...textFieldProps}
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    )
  }

  return (
    <Autocomplete<FormSuggestionOption, false, true, true>
      ref={root}
      id={id}
      freeSolo
      disableClearable
      forcePopupIcon={false}
      fullWidth
      options={suggestions}
      filterOptions={(options) => options}
      open={popupOpen}
      value={value}
      inputValue={value}
      getOptionLabel={(option) =>
        typeof option === "string" ? option : option.value
      }
      isOptionEqualToValue={(option, current) =>
        option.value === (typeof current === "string" ? current : current.value)
      }
      onOpen={() => {
        if (!value.trim()) setOpen(true)
      }}
      onClose={() => setOpen(false)}
      onChange={(_event, selected) => {
        if (selected && typeof selected !== "string") {
          onValueChange(selected.value)
          setOpen(false)
        }
      }}
      onInputChange={(_event, next, reason) => {
        if (reason === "input" || reason === "clear") {
          onValueChange(next)
          setOpen(!next.trim())
        }
      }}
      sx={{
        "& .MuiOutlinedInput-root": { p: 0 },
        "& .MuiOutlinedInput-root .MuiAutocomplete-input": {
          py: MATERIAL_INPUT_PADDING,
          px: "14px",
        },
      }}
      slotProps={{
        popper: {
          container: () =>
            root.current?.closest('[role="dialog"]') ?? document.body,
          placement: "bottom-start",
          style: { ...themeStyle, zIndex: 50 },
        },
        paper: {
          elevation: 0,
          className:
            "mt-1 border border-border bg-popover text-popover-foreground shadow-md",
        },
        listbox: {
          "aria-label": suggestionsLabel,
          ...(suggestionsLabel ? { "aria-labelledby": undefined } : {}),
        },
      }}
      renderOption={({ key, ...optionProps }, option) => (
        <li key={key} {...optionProps}>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-popover-foreground">
              {option.label}
            </span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {option.value}
            </span>
          </div>
        </li>
      )}
      renderInput={(params) => (
        <FormTextField
          {...textFieldProps}
          id={params.id}
          disabled={params.disabled}
          fullWidth={params.fullWidth}
          slotProps={{
            inputLabel: params.slotProps.inputLabel,
            input: params.slotProps.input,
            htmlInput: {
              ...params.slotProps.htmlInput,
              onFocus: (event: FocusEvent<HTMLInputElement>) => {
                params.slotProps.htmlInput.onFocus?.(event)
                if (!value.trim()) setOpen(true)
              },
              onClick: (event: MouseEvent<HTMLInputElement>) => {
                params.slotProps.htmlInput.onClick?.(event)
                if (!value.trim()) setOpen(true)
              },
            },
          }}
        />
      )}
    />
  )
}
