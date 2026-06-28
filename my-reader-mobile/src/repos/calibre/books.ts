import { eq, sql } from "drizzle-orm"

import {
  authors,
  books,
  booksAuthorsLink,
  data,
} from "@my-reader/db/schema/calibre"

import { withCalibreDb } from "../../services/db/calibre-db"

export type BookWithAuthorsRow = {
  id: number
  title: string | null
  authorSort: string | null
  path: string | null
  hasCover: number | null
  timestamp: string | null
  authors: string[]
  formats: string[]
}

export type BookSummaryRow = {
  id: number
  path: string | null
  hasCover: number
  formats: string[]
}

export async function countBooks(metadataUri: string): Promise<number> {
  return withCalibreDb(metadataUri, async (db) => {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(books)
      .get()
    return result ? Number(result.count) : 0
  })
}

export async function listBooksWithAuthors(
  metadataUri: string,
): Promise<BookWithAuthorsRow[]> {
  return withCalibreDb(metadataUri, async (db) => {
    const bookRows = await db
      .select({
        id: books.id,
        title: books.title,
        authorSort: books.authorSort,
        path: books.path,
        hasCover: books.hasCover,
        timestamp: books.timestamp,
      })
      .from(books)
      .orderBy(sql`${books.sort} COLLATE NOCASE ASC`)
      .all()

    if (bookRows.length === 0) {
      return []
    }

    const authorLinks = await db
      .select({ book: booksAuthorsLink.book, name: authors.name })
      .from(booksAuthorsLink)
      .innerJoin(authors, eq(authors.id, booksAuthorsLink.author))
      .all()

    const dataRows = await db
      .select({ book: data.book, format: data.format })
      .from(data)
      .all()

    const authorMap = new Map<number, string[]>()
    for (const link of authorLinks) {
      const list = authorMap.get(link.book) ?? []
      if (link.name) {
        list.push(link.name)
      }
      authorMap.set(link.book, list)
    }

    const formatMap = new Map<number, string[]>()
    for (const row of dataRows) {
      const list = formatMap.get(row.book) ?? []
      const upper = (row.format ?? "").toUpperCase()
      if (!list.includes(upper)) {
        list.push(upper)
      }
      formatMap.set(row.book, list)
    }

    return bookRows.map((row) => ({
      id: row.id,
      title: row.title,
      authorSort: row.authorSort,
      path: row.path,
      hasCover: row.hasCover,
      timestamp: row.timestamp,
      authors: authorMap.get(row.id) ?? [],
      formats: formatMap.get(row.id) ?? [],
    }))
  })
}

export async function listBookSummaries(
  metadataUri: string,
): Promise<BookSummaryRow[]> {
  return withCalibreDb(metadataUri, async (db) => {
    const bookRows = await db
      .select({
        id: books.id,
        path: books.path,
        hasCover: books.hasCover,
      })
      .from(books)
      .all()

    const dataRows = await db
      .select({ book: data.book, format: data.format })
      .from(data)
      .all()

    const formatMap = new Map<number, string[]>()
    for (const row of dataRows) {
      const list = formatMap.get(row.book) ?? []
      const upper = (row.format ?? "").toUpperCase()
      if (!list.includes(upper)) {
        list.push(upper)
      }
      formatMap.set(row.book, list)
    }

    return bookRows.map((row) => ({
      id: row.id,
      path: row.path,
      hasCover: row.hasCover ?? 0,
      formats: formatMap.get(row.id) ?? [],
    }))
  })
}
