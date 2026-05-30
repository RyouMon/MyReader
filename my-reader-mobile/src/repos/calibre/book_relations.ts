import { eq } from "drizzle-orm";

import {
  authors,
  books,
  booksAuthorsLink,
  booksLanguagesLink,
  booksPublishersLink,
  booksRatingsLink,
  booksSeriesLink,
  booksTagsLink,
  comments,
  data,
  identifiers,
  languages,
  publishers,
  ratings,
  series,
  tags,
} from "@my-reader/db/schema/calibre";

import { withCalibreDb } from "../../services/db/calibre-db";

export type BookDetailRows = {
  book: typeof books.$inferSelect | undefined;
  authorRows: { name: string | null }[];
  tagRows: { name: string | null }[];
  seriesRow: { name: string | null } | undefined;
  formatRows: { format: string | null; uncompressedSize: number | null }[];
  commentRow: { text: string | null } | undefined;
  publisherRow: { name: string | null } | undefined;
  languageRows: { langCode: string | null }[];
  ratingRow: { rating: number | null } | undefined;
  identifierRows: { type: string | null; val: string | null }[];
};

export async function fetchBookDetailRows(
  metadataUri: string,
  calibreBookId: number,
): Promise<BookDetailRows> {
  return withCalibreDb(metadataUri, async (db) => {
    const book = await db.select().from(books).where(eq(books.id, calibreBookId)).get();

    if (!book) {
      return {
        book: undefined,
        authorRows: [],
        tagRows: [],
        seriesRow: undefined,
        formatRows: [],
        commentRow: undefined,
        publisherRow: undefined,
        languageRows: [],
        ratingRow: undefined,
        identifierRows: [],
      };
    }

    const [
      authorRows,
      tagRows,
      seriesRow,
      formatRows,
      commentRow,
      publisherRow,
      languageRows,
      ratingRow,
      identifierRows,
    ] = await Promise.all([
      db
        .select({ name: authors.name })
        .from(booksAuthorsLink)
        .innerJoin(authors, eq(authors.id, booksAuthorsLink.author))
        .where(eq(booksAuthorsLink.book, calibreBookId))
        .all(),
      db
        .select({ name: tags.name })
        .from(booksTagsLink)
        .innerJoin(tags, eq(tags.id, booksTagsLink.tag))
        .where(eq(booksTagsLink.book, calibreBookId))
        .all(),
      db
        .select({ name: series.name })
        .from(booksSeriesLink)
        .innerJoin(series, eq(series.id, booksSeriesLink.series))
        .where(eq(booksSeriesLink.book, calibreBookId))
        .get(),
      db
        .select({
          format: data.format,
          uncompressedSize: data.uncompressedSize,
        })
        .from(data)
        .where(eq(data.book, calibreBookId))
        .orderBy(data.format)
        .all(),
      db
        .select({ text: comments.text })
        .from(comments)
        .where(eq(comments.book, calibreBookId))
        .get(),
      db
        .select({ name: publishers.name })
        .from(booksPublishersLink)
        .innerJoin(publishers, eq(publishers.id, booksPublishersLink.publisher))
        .where(eq(booksPublishersLink.book, calibreBookId))
        .get(),
      db
        .select({ langCode: languages.langCode })
        .from(booksLanguagesLink)
        .innerJoin(languages, eq(languages.id, booksLanguagesLink.langCode))
        .where(eq(booksLanguagesLink.book, calibreBookId))
        .all(),
      db
        .select({ rating: ratings.rating })
        .from(booksRatingsLink)
        .innerJoin(ratings, eq(ratings.id, booksRatingsLink.rating))
        .where(eq(booksRatingsLink.book, calibreBookId))
        .get(),
      db
        .select({
          type: identifiers.type,
          val: identifiers.val,
        })
        .from(identifiers)
        .where(eq(identifiers.book, calibreBookId))
        .orderBy(identifiers.type)
        .all(),
    ]);

    return {
      book,
      authorRows,
      tagRows,
      seriesRow,
      formatRows,
      commentRow,
      publisherRow,
      languageRows,
      ratingRow,
      identifierRows,
    };
  });
}
