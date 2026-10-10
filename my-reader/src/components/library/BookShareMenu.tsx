import { Copy, FolderOpen, Save, Share2 } from "lucide-react"
import type { ElementType } from "react"
import { useTranslation } from "react-i18next"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useBookFileActions } from "@/hooks/useBookFileActions"

interface BookShareProps {
  libraryId: string | null
  bookId: number
  format: string
}

interface ShareActionParts {
  Group: ElementType
  Item: ElementType
}

const dropdownActionParts: ShareActionParts = {
  Group: DropdownMenuGroup,
  Item: DropdownMenuItem,
}

export function BookShareMenu(props: BookShareProps) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        title={t("bookShare.share")}
        aria-label={t("bookShare.shareFormat", { format: props.format })}
        disabled={!props.libraryId}
      >
        <Share2 />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <BookShareActions {...props} parts={dropdownActionParts} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function BookShareSubMenu({
  libraryId,
  bookId,
  formats,
  parts,
}: Omit<BookShareProps, "format"> & {
  formats: string[]
  parts: ShareActionParts & {
    Sub: ElementType
    SubTrigger: ElementType
    SubContent: ElementType
  }
}) {
  const { t } = useTranslation()
  const { Sub, SubTrigger, SubContent } = parts
  if (formats.length === 0) return null

  return (
    <Sub>
      <SubTrigger disabled={!libraryId}>
        <Share2 />
        {t("bookShare.share")}
      </SubTrigger>
      <SubContent>
        {formats.length === 1 ? (
          <BookShareActions
            libraryId={libraryId}
            bookId={bookId}
            format={formats[0]}
            parts={parts}
          />
        ) : (
          formats.map((format) => (
            <Sub key={format}>
              <SubTrigger>{format}</SubTrigger>
              <SubContent>
                <BookShareActions
                  libraryId={libraryId}
                  bookId={bookId}
                  format={format}
                  parts={parts}
                />
              </SubContent>
            </Sub>
          ))
        )}
      </SubContent>
    </Sub>
  )
}

function BookShareActions({
  libraryId,
  bookId,
  format,
  parts,
}: BookShareProps & { parts: ShareActionParts }) {
  const { t } = useTranslation()
  const { Group, Item } = parts
  const { disabled, unavailable, copyPath, revealFile, saveAs } =
    useBookFileActions(libraryId, bookId, format)
  return (
    <Group>
      <Item disabled={disabled} onSelect={() => void copyPath()}>
        <Copy />
        {t("bookShare.copyPath")}
      </Item>
      <Item disabled={disabled} onSelect={() => void revealFile()}>
        <FolderOpen />
        {t("bookShare.revealFile")}
      </Item>
      <Item disabled={disabled} onSelect={() => void saveAs()}>
        <Save />
        {t("bookShare.saveAs")}
      </Item>
      {unavailable ? <Item disabled>{t("bookShare.unavailable")}</Item> : null}
    </Group>
  )
}
