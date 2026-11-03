import InputAdornment from "@mui/material/InputAdornment"
import type { TextFieldProps } from "@mui/material/TextField"
import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { FormTextField } from "./FormTextField"

export function FormPasswordField(props: TextFieldProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  return (
    <FormTextField
      {...props}
      type={visible ? "text" : "password"}
      autoComplete="new-password"
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={props.disabled}
                aria-label={t(
                  visible ? "passwordField.hide" : "passwordField.show",
                )}
                aria-pressed={visible}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? <EyeOff /> : <Eye />}
              </Button>
            </InputAdornment>
          ),
        },
      }}
    />
  )
}
