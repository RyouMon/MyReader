import { readBooksFromLibrary } from "./calibre";
import { createRemoteOps } from "./remote-library";
import type { BookItem, DataSource, Library } from "../types";

/** Reads the current book list from app cache metadata for a library. */
export async function fetchBooksForLibrary(
  library: Library,
  dataSources: DataSource[],
): Promise<BookItem[]> {
  const ops = await createRemoteOps(library, dataSources);
  if (ops) {
    const { books } = await ops.readBooks(library);
    return books;
  }
  return readBooksFromLibrary(library);
}
