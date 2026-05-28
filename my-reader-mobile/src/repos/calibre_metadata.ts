import { eq, sql } from "drizzle-orm";

import {
  books,
  authors,
  booksAuthorsLink,
  tags,
  booksTagsLink,
  series,
  booksSeriesLink,
  data,
  comments,
  publishers,
  booksPublishersLink,
  languages,
  booksLanguagesLink,
  ratings,
  booksRatingsLink,
  identifiers,
} from "@my-reader/db/schema/calibre";
import type { BookDetail, BookIdentifier, FormatSize } from "@my-reader/tools/types/book";
import { openCalibreDatabase } from "../services/db/calibre-db";

export async function readBookCountFromMetadata(metadataUri: string): Promise<number> {
  const handle = openCalibreDatabase(metadataUri);
  try {
    const result = await handle.db
      .select({ count: sql<number>`count(*)` })
      .from(books)
      .get();
    return result ? Number(result.count) : 0;
  } finally {
    await handle.raw.closeAsync();
  }
}

export async function readBookDetailFromMetadataDb(
  metadataUri: string,
  calibreBookId: number,
): Promise<BookDetail | null> {
  const handle = openCalibreDatabase(metadataUri);
  try {
    const book = await handle.db
      .select()
      .from(books)
      .where(eq(books.id, calibreBookId))
      .get();

    if (!book) return null;

    const authorRows = await handle.db
      .select({ name: authors.name })
      .from(booksAuthorsLink)
      .innerJoin(authors, eq(authors.id, booksAuthorsLink.author))
      .where(eq(booksAuthorsLink.book, calibreBookId))
      .all();

    const tagRows = await handle.db
      .select({ name: tags.name })
      .from(booksTagsLink)
      .innerJoin(tags, eq(tags.id, booksTagsLink.tag))
      .where(eq(booksTagsLink.book, calibreBookId))
      .all();

    const seriesRow = await handle.db
      .select({ name: series.name })
      .from(booksSeriesLink)
      .innerJoin(series, eq(series.id, booksSeriesLink.series))
      .where(eq(booksSeriesLink.book, calibreBookId))
      .get();

    const formatRows = await handle.db
      .select({
        format: data.format,
        uncompressedSize: data.uncompressedSize,
      })
      .from(data)
      .where(eq(data.book, calibreBookId))
      .orderBy(data.format)
      .all();

    const commentRow = await handle.db
      .select({ text: comments.text })
      .from(comments)
      .where(eq(comments.book, calibreBookId))
      .get();

    const publisherRow = await handle.db
      .select({ name: publishers.name })
      .from(booksPublishersLink)
      .innerJoin(publishers, eq(publishers.id, booksPublishersLink.publisher))
      .where(eq(booksPublishersLink.book, calibreBookId))
      .get();

    const languageRows = await handle.db
      .select({ langCode: languages.langCode })
      .from(booksLanguagesLink)
      .innerJoin(languages, eq(languages.id, booksLanguagesLink.langCode))
      .where(eq(booksLanguagesLink.book, calibreBookId))
      .all();

    const ratingRow = await handle.db
      .select({ rating: ratings.rating })
      .from(booksRatingsLink)
      .innerJoin(ratings, eq(ratings.id, booksRatingsLink.rating))
      .where(eq(booksRatingsLink.book, calibreBookId))
      .get();

    const identifierRows = await handle.db
      .select({
        type: identifiers.type,
        val: identifiers.val,
      })
      .from(identifiers)
      .where(eq(identifiers.book, calibreBookId))
      .orderBy(identifiers.type)
      .all();

    const bookAuthors = authorRows.map((r) => r.name ?? "").filter(Boolean);
    const bookTags = tagRows.map((r) => r.name ?? "").filter(Boolean);
    const bookLanguages = languageRows.map((r) => r.langCode ?? "").filter(Boolean);
    const formats = formatRows.map((r) => (r.format ?? "").toUpperCase());

    const seriesIndexRaw = book.seriesIndex;
    const seriesIndex =
      seriesIndexRaw !== null && seriesIndexRaw !== undefined && !Number.isNaN(Number(seriesIndexRaw))
        ? Number(seriesIndexRaw)
        : null;

    const formatSizes: FormatSize[] = formatRows.map((r) => ({
      format: (r.format ?? "").toUpperCase(),
      sizeBytes: Math.trunc(Number(r.uncompressedSize ?? 0)),
    }));

    const bookIdentifiers: BookIdentifier[] = identifierRows.map((r) => ({
      idType: r.type ?? "isbn",
      value: r.val,
    }));

    const ratingRaw = ratingRow?.rating;
    const rating =
      ratingRaw !== null && ratingRaw !== undefined && !Number.isNaN(Number(ratingRaw))
        ? Math.round(Number(ratingRaw))
        : null;

    return {
      id: book.id,
      title: book.title || "",
      authorSort: book.authorSort ?? "",
      authors: bookAuthors,
      tags: bookTags,
      series: seriesRow?.name ?? null,
      seriesIndex,
      formats,
      hasCover: (book.hasCover ?? 0) !== 0,
      path: book.path ?? "",
      timestamp: book.timestamp,
      pubdate: book.pubdate,
      lastModified: book.lastModified,
      comment: commentRow?.text ?? null,
      publisher: publisherRow?.name ?? null,
      languages: bookLanguages,
      rating,
      uuid: book.uuid,
      formatSizes,
      identifiers: bookIdentifiers,
    } satisfies BookDetail;
  } finally {
    await handle.raw.closeAsync();
  }
}