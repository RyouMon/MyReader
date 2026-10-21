"""Build the same deterministic EPUB fixture on macOS, Linux and Windows."""

import pathlib
import sys
import zipfile

source = pathlib.Path(__file__).resolve().parents[1] / "fixtures" / "tts-book"
destination = pathlib.Path(sys.argv[1])
destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, "w") as archive:
    archive.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    for path in sorted(source.rglob("*")):
        if path.is_file():
            info = zipfile.ZipInfo(path.relative_to(source).as_posix())
            archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
