export interface PaginatedBooks {
  items: CalibreBook[]
  total: number
}

export interface CalibreBook {
  id: number
  title: string
  authorSort: string
  authors: string[]
  tags: string[]
  series: string | null
  seriesIndex: number | null
  formats: string[]
  hasCover: boolean
  path: string
  timestamp: string | null
  pubdate: string | null
  lastModified: string | null
  comment: string | null
  publisher: string | null
  languages: string[]
  rating: number | null
  uuid: string | null
}

export interface LibraryInfo {
  id: string
  name: string
  path: string
  bookCount: number
}
