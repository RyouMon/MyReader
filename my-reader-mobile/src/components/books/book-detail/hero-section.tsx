import type { BookDetail } from "my-reader-tools/types/book";

import { Image, Text, View } from "../../../tw";
import { FONT_DISPLAY, FONT_UI } from "../../../design/typography";
import type { BookItem } from "../../../data/types";
import type { DetailColors } from "./types";

type HeroSectionProps = {
  book: BookDetail;
  colors: DetailColors;
  coverUri?: BookItem["coverUri"];
  metaLine: string;
  ratingStars: number;
  ratingValue: string | null;
  seriesLabel: string | null;
};

export function HeroSection({
  book,
  colors,
  coverUri,
  metaLine,
  ratingStars,
  ratingValue,
  seriesLabel,
}: HeroSectionProps) {
  const authors = book.authors.filter(Boolean).join(", ") || book.authorSort;
  const ratingLabel = ratingValue
    ? `${"★".repeat(ratingStars)}${"☆".repeat(5 - ratingStars)}  ${ratingValue}`
    : null;

  return (
    <View className="flex-row gap-4 px-4 pb-5 pt-4" style={{ backgroundColor: colors.sectionBg }}>
      <View
        className="h-[188px] w-[128px] overflow-hidden rounded-xl"
        style={{
          backgroundColor: colors.accentPressed,
          borderColor: "rgba(0,0,0,0.13)",
          borderWidth: 1,
        }}
      >
        {coverUri ? (
          <Image source={coverUri} className="h-full w-full object-cover" />
        ) : (
          <View
            className="h-full w-full justify-end px-3 py-4"
            style={{ backgroundColor: colors.accentPressed }}
          >
            <Text
              className="text-center text-[15px] leading-5"
              numberOfLines={4}
              style={{
                color: "#FFFFFF",
                fontFamily: FONT_DISPLAY,
                fontWeight: "700",
                opacity: 0.88,
              }}
            >
              {book.title}
            </Text>
          </View>
        )}
      </View>

      <View className="flex-1 gap-3 py-1">
        <Text
          className="text-xl leading-7"
          numberOfLines={3}
          style={{ color: colors.text, fontFamily: FONT_DISPLAY, fontWeight: "700" }}
        >
          {book.title}
        </Text>
        {seriesLabel ? (
          <Text
            className="text-sm leading-5"
            numberOfLines={2}
            style={{ color: colors.tertiary, fontFamily: FONT_UI }}
          >
            {seriesLabel}
          </Text>
        ) : null}
        <Text
          className="text-base leading-6"
          numberOfLines={2}
          style={{ color: colors.accent, fontFamily: FONT_UI, fontWeight: "600" }}
        >
          {authors}
        </Text>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        {metaLine ? (
          <Text
            className="text-sm leading-5"
            numberOfLines={2}
            style={{ color: colors.tertiary, fontFamily: FONT_UI }}
          >
            {metaLine}
          </Text>
        ) : null}
        {ratingLabel ? (
          <Text
            className="text-sm leading-5"
            style={{ color: colors.muted, fontFamily: FONT_UI, fontWeight: "600" }}
          >
            {ratingLabel}
          </Text>
        ) : null}
        {book.tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-1">
            {book.tags.slice(0, 4).map((tag) => (
              <View
                key={tag}
                className="min-h-9 justify-center rounded-2xl px-[14px] py-[9px]"
                style={{ backgroundColor: colors.tagBg, borderColor: colors.border, borderWidth: 1 }}
              >
                <Text
                  className="text-[13px] leading-5"
                  style={{ color: colors.tagText, fontFamily: FONT_UI, fontWeight: "600" }}
                >
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
