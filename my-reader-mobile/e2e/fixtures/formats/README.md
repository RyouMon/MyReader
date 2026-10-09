# Reading fixtures

`MyReader-QA.pdf` and `MyReader-QA.cbz` are synthetic, project-authored books.
Each has three visibly numbered pages. They contain no personal library data.
The PDF metadata is **MyReader QA PDF** / **MyReader**; the CBZ uses its filename
as its title. The EPUB comes from the existing `../tts-book/` sources.
Its cover reuses the CBZ's first synthetic page.

The small PDF was generated with ReportLab 4.4.9, and the CBZ contains PNG pages
generated with Pillow 12.3.0 and packaged with Python's standard ZIP library.
Keep these fixtures outside app routes and production assets.
