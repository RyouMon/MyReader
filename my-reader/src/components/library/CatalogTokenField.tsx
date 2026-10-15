import { useId, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Search, X } from "lucide-react"
import {
  catalogSuggestions,
  parseCatalogTokens,
  tokenKey,
  type CatalogNavigation,
  type CatalogToken,
} from "@my-reader/tools/catalog-navigation"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { cn } from "@/lib/utils"

export type CatalogTokenFieldProps = {
  placeholder?: string
  tokens: CatalogToken[]
  onTokensChange: (tokens: CatalogToken[], query?: string) => void
  navigation: CatalogNavigation
  searchQuery: string
  onSearchChange: (query: string) => void
}

export function CatalogTokenField({
  placeholder,
  tokens,
  onTokensChange,
  navigation,
  searchQuery,
  onSearchChange,
}: CatalogTokenFieldProps) {
  const { t } = useTranslation()
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const hasQuery = searchQuery.trim().length > 0
  const delayedText = useDebouncedValue(searchQuery, 180)
  const suggestions = useMemo(
    () =>
      hasQuery
        ? catalogSuggestions(navigation, delayedText, tokens).slice(0, 40)
        : [],
    [navigation, hasQuery, delayedText, tokens],
  )
  const expanded = focused && suggestions.length > 0
  function choose(token: CatalogToken) {
    onTokensChange(parseCatalogTokens([...tokens, token]), "")
    setActive(-1)
    input.current?.focus()
  }
  function remove(index: number) {
    onTokensChange(tokens.filter((_, i) => i !== index))
    input.current?.focus()
  }
  return (
    <div
      className="relative min-w-0 flex-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false)
          setActive(-1)
        }
      }}
    >
      <div className="flex min-h-8 items-center gap-1 rounded-md bg-muted px-2 ring-ring focus-within:ring-1">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
          {tokens.map((token, index) => (
            <div
              key={tokenKey(token)}
              className="flex shrink-0 items-center rounded bg-primary-soft text-primary"
              draggable
              onDragStart={(event) =>
                event.dataTransfer.setData(
                  "application/x-myreader-token",
                  String(index),
                )
              }
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const raw = event.dataTransfer.getData(
                  "application/x-myreader-token",
                )
                if (!raw) return
                const from = Number(raw)
                if (!tokens[from]) return
                const next = [...tokens]
                const [moved] = next.splice(from, 1)
                next.splice(index, 0, moved)
                onTokensChange(next)
              }}
            >
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="max-w-48 truncate rounded px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${t(`catalog.${token.kind}`)}: ${token.value}`}
                  onKeyDown={(event) => {
                    if (event.key === "Backspace" || event.key === "Delete") {
                      event.preventDefault()
                      remove(index)
                    }
                  }}
                >
                  {t(`catalog.${token.kind}`)}: {token.value}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  onCloseAutoFocus={(event) => {
                    event.preventDefault()
                    input.current?.focus()
                  }}
                >
                  <DropdownMenuItem onSelect={() => remove(index)}>
                    {t("catalog.removeToken")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                className="rounded p-1 hover:bg-primary/15"
                aria-label={t("catalog.removeNamedToken", {
                  name: token.value,
                })}
                onClick={() => remove(index)}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          <Input
            ref={input}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={
              expanded && active >= 0 ? `${listId}-${active}` : undefined
            }
            aria-label={placeholder ?? t("catalog.searchPlaceholder")}
            placeholder={placeholder ?? t("catalog.searchPlaceholder")}
            value={searchQuery}
            className="h-7 min-w-28 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            onFocus={() => setFocused(true)}
            onChange={(event) => {
              setFocused(true)
              setActive(-1)
              onSearchChange(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === "Escape") {
                setFocused(false)
                setActive(-1)
                return
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                setFocused(true)
                setActive((i) =>
                  Math.max(
                    0,
                    Math.min(
                      suggestions.length - 1,
                      i + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
                )
                return
              }
              if (event.key === "Enter") {
                const choice =
                  expanded && active >= 0 ? suggestions[active] : undefined
                if (choice) {
                  event.preventDefault()
                  choose(choice)
                } else {
                  setFocused(false)
                  setActive(-1)
                }
              }
              if (event.key === "Backspace" && !searchQuery && tokens.length) {
                const triggers =
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    "[data-slot=dropdown-menu-trigger]",
                  )
                triggers?.[triggers.length - 1]?.focus()
              }
            }}
          />
        </div>
      </div>
      {expanded && (
        <div
          id={listId}
          role="listbox"
          aria-label={t("catalog.suggestions")}
          className="absolute start-0 top-full z-50 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {suggestions.map((token, index) => (
            <button
              id={`${listId}-${index}`}
              key={tokenKey(token)}
              role="option"
              aria-selected={active === index}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded px-3 py-2 text-start text-sm hover:bg-accent",
                active === index && "bg-accent",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(token)}
            >
              <span className="shrink-0 text-xs text-muted-foreground">
                {t(`catalog.${token.kind}`)}
              </span>
              <span className="truncate">{token.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
