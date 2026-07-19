import {
  READER_ANNOTATION_COLORS,
  type ReaderAnnotationColor,
} from "@my-reader/tools/reader-annotations"
import { Popover } from "radix-ui"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

type ReaderSelectionMenuProps = {
  anchor: { x: number; y: number } | null
  currentColor?: ReaderAnnotationColor
  disabled?: boolean
  existing?: boolean
  hasNote?: boolean
  onColorSelect: (color: ReaderAnnotationColor) => void
  onEditNote: () => void
  onRemove: () => void
  onOpenChange: (open: boolean) => void
}

const COLORS = Object.keys(READER_ANNOTATION_COLORS) as ReaderAnnotationColor[]

export function ReaderSelectionMenu({
  anchor,
  currentColor,
  disabled = false,
  existing = false,
  hasNote = false,
  onColorSelect,
  onEditNote,
  onRemove,
  onOpenChange,
}: ReaderSelectionMenuProps) {
  const { t } = useTranslation()

  return (
    <Popover.Root open={anchor !== null} onOpenChange={onOpenChange}>
      {anchor ? (
        <Popover.Anchor asChild>
          <span
            className="pointer-events-none fixed z-50 size-px"
            style={{ left: anchor.x, top: anchor.y }}
            aria-hidden
          />
        </Popover.Anchor>
      ) : null}
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          aria-label={t("reader.selectionActions")}
          className="z-50 flex h-11 items-center overflow-hidden rounded-xl border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">{t("reader.highlightColor")}</legend>
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="grid size-9 place-items-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50"
                aria-label={t(`reader.annotationColors.${color}`)}
                aria-pressed={color === currentColor}
                disabled={disabled}
                onClick={() => onColorSelect(color)}
              >
                <span
                  className={cn(
                    "size-5 rounded-full ring-offset-2 ring-offset-popover",
                    color === currentColor && "ring-2 ring-foreground",
                  )}
                  style={{ backgroundColor: READER_ANNOTATION_COLORS[color] }}
                  aria-hidden
                />
              </button>
            ))}
          </fieldset>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <button
            type="button"
            className="h-9 rounded-md px-3 font-medium outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            onClick={onEditNote}
          >
            {t(hasNote ? "reader.editNote" : "reader.addNote")}
          </button>
          {existing ? (
            <>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <button
                type="button"
                className="h-9 rounded-md px-3 font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
                disabled={disabled}
                onClick={onRemove}
              >
                {t("reader.removeHighlight")}
              </button>
            </>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
