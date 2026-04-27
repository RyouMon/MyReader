import type { BookDetail } from "my-reader-tools/types/book";

import { Text, View } from "../../../tw";
import { FONT_MONO, FONT_UI } from "../../../design/typography";
import { IDENTIFIER_LABELS } from "../../../utils/book-detail";
import type { DetailColors } from "./types";
import { SectionFrame, SectionHeader } from "./section-frame";

type IdentifierSectionProps = {
  book: BookDetail;
  colors: DetailColors;
};

export function IdentifierSection({ book, colors }: IdentifierSectionProps) {
  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} title="标识符" />
      <View className="flex-row flex-wrap gap-2">
        {book.identifiers.map((ident, idx) => (
          <View
            key={`${ident.idType}-${ident.value}-${idx}`}
            className="rounded-[10px] px-3 py-2"
            style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
          >
            <Text
              className="text-[10px] uppercase leading-4"
              style={{ color: colors.tertiary, fontFamily: FONT_UI, fontWeight: "600" }}
            >
              {IDENTIFIER_LABELS[ident.idType] ?? ident.idType}
            </Text>
            <Text
              className="mt-0.5 text-xs leading-4"
              style={{ color: colors.text, fontFamily: FONT_MONO }}
            >
              {ident.value}
            </Text>
          </View>
        ))}
      </View>
    </SectionFrame>
  );
}
