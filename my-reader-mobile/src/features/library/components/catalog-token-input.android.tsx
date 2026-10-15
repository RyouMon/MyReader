import CloseIcon from "@expo/material-symbols/close.xml"
import SearchIcon from "@expo/material-symbols/search.xml"
import {
  Column,
  FlowRow,
  Host,
  Icon,
  IconButton,
  InputChip,
  Text,
  TextField,
  type TextFieldRef,
  useNativeState,
} from "@expo/ui/jetpack-compose"
import {
  fillMaxWidth,
  onSizeChanged,
  semantics,
} from "@expo/ui/jetpack-compose/modifiers"
import { tokenKey } from "@my-reader/tools/catalog-navigation"
import { useEffect, useImperativeHandle, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useThemePalette } from "@/src/design/tokens"
import type { CatalogTokenInputProps } from "./catalog-token-input.types"

export default function CatalogTokenInput({
  ref,
  tokens,
  text,
  placeholder,
  onChange,
  onSubmit,
  onHeightChange,
}: CatalogTokenInputProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const input = useRef<TextFieldRef>(null)
  const value = useNativeState(text)
  const lastNativeText = useRef(text)
  useImperativeHandle(ref, () => ({
    focus: () => void input.current?.focus(),
  }))
  useEffect(() => {
    // Native typing already updates the shared state; only write external edits.
    if (text !== lastNativeText.current) value.set(text)
    lastNativeText.current = text
  }, [text, value])
  return (
    <Host matchContents={{ vertical: true }} seedColor={palette.primary}>
      <Column modifiers={[fillMaxWidth()]}>
        {tokens.length > 0 && (
          <FlowRow horizontalArrangement={{ spacedBy: 8 }}>
            {tokens.map((token, index) => (
              <InputChip
                key={tokenKey(token)}
                selected
                onClick={() => void input.current?.focus()}
                colors={{
                  selectedContainerColor: palette.backgroundSecondary,
                  selectedLabelColor: palette.primary,
                  selectedTrailingIconColor: palette.primary,
                }}
              >
                <InputChip.Label>
                  <Text>{`${t(`catalog.${token.kind}`)}: ${token.value}`}</Text>
                </InputChip.Label>
                <InputChip.TrailingIcon>
                  <IconButton
                    onClick={() =>
                      onChange(
                        tokens.filter((_, i) => i !== index),
                        text,
                      )
                    }
                    modifiers={[
                      semantics({
                        contentDescription: t("catalog.removeNamedToken", {
                          name: token.value,
                        }),
                      }),
                    ]}
                    colors={{ contentColor: palette.primary }}
                  >
                    <Icon source={CloseIcon} size={18} />
                  </IconButton>
                </InputChip.TrailingIcon>
              </InputChip>
            ))}
          </FlowRow>
        )}
        <TextField
          ref={input}
          value={value}
          autoFocus
          singleLine
          modifiers={[
            fillMaxWidth(),
            onSizeChanged(({ height }) => onHeightChange(height)),
            semantics({ contentDescription: placeholder }),
          ]}
          keyboardOptions={{ imeAction: "search", autoCorrectEnabled: false }}
          keyboardActions={{ onSearch: onSubmit }}
          onValueChange={(next) => {
            lastNativeText.current = next
            onChange(tokens, next)
          }}
          colors={{
            focusedTextColor: palette.text,
            unfocusedTextColor: palette.text,
            cursorColor: palette.primary,
            focusedContainerColor: palette.surface,
            unfocusedContainerColor: palette.surface,
            focusedPlaceholderColor: palette.textMuted,
            unfocusedPlaceholderColor: palette.textMuted,
            focusedIndicatorColor: palette.primary,
            unfocusedIndicatorColor: palette.border,
          }}
        >
          <TextField.LeadingIcon>
            <Icon source={SearchIcon} tint={palette.textMuted} size={22} />
          </TextField.LeadingIcon>
          <TextField.Placeholder>
            <Text>{placeholder}</Text>
          </TextField.Placeholder>
          {text.length > 0 && (
            <TextField.TrailingIcon>
              <IconButton
                onClick={() => onChange(tokens, "")}
                modifiers={[
                  semantics({ contentDescription: t("common.clear") }),
                ]}
                colors={{ contentColor: palette.textMuted }}
              >
                <Icon source={CloseIcon} size={22} />
              </IconButton>
            </TextField.TrailingIcon>
          )}
        </TextField>
      </Column>
    </Host>
  )
}
