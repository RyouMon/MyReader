"""Regenerate the three original Kindle test books with Calibre's calibre-debug -e."""
from io import BytesIO
from pathlib import Path
from subprocess import run
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import shutil

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

fixtures = Path(__file__).resolve().parent
convert = shutil.which("ebook-convert")
if not convert:
    raise SystemExit("Add Calibre's executables to PATH")

def fixture_font():
    font = FontBuilder(1000, isTTF=True)
    font.setupGlyphOrder([".notdef", "A"])
    font.setupCharacterMap({65: "A"})
    pen = TTGlyphPen(None)
    pen.moveTo((30, 0))
    pen.lineTo((500, 800))
    pen.lineTo((940, 0))
    pen.closePath()
    font.setupGlyf({".notdef": TTGlyphPen(None).glyph(), "A": pen.glyph()})
    font.setupHorizontalMetrics({glyph: (1000, 0) for glyph in [".notdef", "A"]})
    font.setupHorizontalHeader(ascent=850, descent=-150)
    font.setupNameTable({"familyName": "Lantern QA", "styleName": "Regular", "psName": "LanternQA"})
    font.setupOS2()
    font.setupPost()
    buffer = BytesIO()
    font.save(buffer)
    return buffer.getvalue()

with TemporaryDirectory() as staging:
    original = Path(staging, "original.epub")
    source = Path(staging, "with-font.epub")
    run([convert, fixtures / "ReaderFormats.fb2", original, "--no-default-epub-cover"], check=True)
    with ZipFile(original) as book, ZipFile(source, "w") as output:
        for item in book.infolist():
            data = book.read(item)
            if item.filename == "stylesheet.css":
                data += b'\n@font-face{font-family:Lantern;src:url("lantern.ttf")} p{font-family:Lantern}'
            if item.filename == "content.opf":
                data = data.replace(b"</manifest>", b'<item id="lantern-font" href="lantern.ttf" media-type="application/x-font-ttf"/></manifest>')
            output.writestr(item, data)
        output.writestr("lantern.ttf", fixture_font())
    for name, options in [
        ("Lantern.mobi", ["--mobi-file-type", "old"]),
        ("Combo.mobi", ["--mobi-file-type", "both"]),
        ("Lantern.azw3", []),
    ]:
        run([convert, source, fixtures / name, *options], check=True)
