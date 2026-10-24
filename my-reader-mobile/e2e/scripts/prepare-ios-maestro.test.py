import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location(
    "prepare_ios_maestro", Path(__file__).with_name("prepare-ios-maestro.py")
)
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


class DriverPackagingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.official = self.root / "official"
        self.products = self.root / "products"
        self.output = self.root / "modified"
        (self.official / "bin").mkdir(parents=True)
        (self.official / "bin/maestro").write_text("#!/bin/sh\nexit 0\n")
        (self.official / "bin/maestro").chmod(0o755)
        (self.official / "lib").mkdir()
        (self.official / "lib/unchanged-library.jar").write_bytes(b"other library")
        self.entries = {
            "driver-iphoneos/untouched.zip": b"device driver",
            "maestro/driver/Unchanged.class": b"existing bytecode",
            driver.RESOURCE_ROOT + "maestro-driver-ios-config.xctestrun": b"old config",
        }
        for app in driver.APPS:
            self.entries[
                driver.RESOURCE_ROOT
                + "Debug-iphonesimulator/"
                + app.replace(".app", ".zip")
            ] = b"old application"
            folder = self.products / "Debug-iphonesimulator" / app
            (folder / "_CodeSignature").mkdir(parents=True)
            binary = folder / "executable"
            binary.write_bytes(b"new executable")
            binary.chmod(0o755)
            (folder / "_CodeSignature/CodeResources").write_bytes(b"signed resources")
        (self.products / "driver.xctestrun").write_bytes(b"new configuration")
        self.jar = self.official / "lib/maestro-ios-driver.jar"
        self.write_jar()

    def write_jar(self):
        with zipfile.ZipFile(self.jar, "w") as archive:
            for name, data in self.entries.items():
                archive.writestr(name, data)

    def test_overlay_preserves_official_cli_and_all_unrelated_resources(self):
        original = self.jar.read_bytes()
        proof = driver.create_overlay(self.official, self.products, self.output)
        self.assertEqual(self.jar.read_bytes(), original)
        self.assertEqual(
            (self.output / "lib/unchanged-library.jar").read_bytes(), b"other library"
        )
        self.assertTrue((self.output / "bin/maestro").stat().st_mode & 0o111)
        self.assertEqual(
            proof["officialJarSha256"], hashlib.sha256(original).hexdigest()
        )
        with zipfile.ZipFile(self.output / "lib/maestro-ios-driver.jar") as archive:
            self.assertEqual(set(archive.namelist()), set(self.entries))
            self.assertEqual(
                archive.read("driver-iphoneos/untouched.zip"), b"device driver"
            )
            self.assertEqual(
                archive.read("maestro/driver/Unchanged.class"), b"existing bytecode"
            )
            self.assertEqual(
                archive.read(
                    driver.RESOURCE_ROOT + "maestro-driver-ios-config.xctestrun"
                ),
                b"new configuration",
            )
            for app in driver.APPS:
                resource = (
                    driver.RESOURCE_ROOT
                    + "Debug-iphonesimulator/"
                    + app.replace(".app", ".zip")
                )
                with zipfile.ZipFile(io.BytesIO(archive.read(resource))) as bundle:
                    self.assertEqual(
                        bundle.read(app + "/executable"), b"new executable"
                    )
                    self.assertTrue(
                        (bundle.getinfo(app + "/executable").external_attr >> 16)
                        & 0o111
                    )
                    self.assertEqual(
                        bundle.read(app + "/_CodeSignature/CodeResources"),
                        b"signed resources",
                    )

    def test_missing_simulator_resource_cannot_publish_partial_overlay(self):
        del self.entries[driver.RESOURCE_ROOT + "maestro-driver-ios-config.xctestrun"]
        self.write_jar()
        with self.assertRaisesRegex(ValueError, "missing required simulator resources"):
            driver.create_overlay(self.official, self.products, self.output)
        self.assertFalse(self.output.exists())

    def test_existing_destination_is_never_overwritten(self):
        self.output.mkdir()
        sentinel = self.output / "sentinel"
        sentinel.write_text("keep")
        with self.assertRaisesRegex(ValueError, "already exists"):
            driver.create_overlay(self.official, self.products, self.output)
        self.assertEqual(sentinel.read_text(), "keep")

    def test_ambiguous_configuration_is_rejected(self):
        (self.products / "other.xctestrun").write_bytes(b"other")
        with self.assertRaisesRegex(ValueError, "exactly one"):
            driver.create_overlay(self.official, self.products, self.output)
        self.assertFalse(self.output.exists())

    def test_application_symlinks_are_rejected(self):
        app = self.products / "Debug-iphonesimulator" / driver.APPS[0]
        (app / "outside").symlink_to(self.jar)
        with self.assertRaisesRegex(ValueError, "Unexpected symlink"):
            driver.create_overlay(self.official, self.products, self.output)
        self.assertFalse(self.output.exists())

    def test_checksum_mismatch_fails(self):
        with self.assertRaisesRegex(ValueError, "Checksum mismatch"):
            driver.verify_checksum(self.jar, "0" * 64)

    def archive(self, entries):
        path = self.root / "source.tar.gz"
        with tarfile.open(path, "w:gz") as archive:
            for name, contents, link in entries:
                entry = tarfile.TarInfo(name)
                if link is not None:
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = link
                    archive.addfile(entry)
                else:
                    entry.size = len(contents)
                    archive.addfile(entry, io.BytesIO(contents))
        return path

    def test_extracts_only_the_ios_driver_source(self):
        archive = self.archive(
            [
                ("repo/other/ignored", b"unrelated", None),
                ("repo/maestro-ios-xctest-runner/subdir/file.swift", b"source", None),
            ]
        )
        destination = self.root / "source"
        driver.extract_sources(archive, destination)
        self.assertEqual((destination / "subdir/file.swift").read_bytes(), b"source")
        self.assertEqual(
            [
                str(p.relative_to(destination))
                for p in destination.rglob("*")
                if p.is_file()
            ],
            ["subdir/file.swift"],
        )

    def test_source_path_escape_is_rejected(self):
        archive = self.archive(
            [("repo/maestro-ios-xctest-runner/../escape", b"outside", None)]
        )
        with self.assertRaisesRegex(ValueError, "Unsafe source path"):
            driver.extract_sources(archive, self.root / "source")
        self.assertFalse((self.root / "escape").exists())

    def test_source_symlink_is_rejected(self):
        archive = self.archive(
            [("repo/maestro-ios-xctest-runner/link", b"", "../outside")]
        )
        with self.assertRaisesRegex(ValueError, "Unsupported source entry"):
            driver.extract_sources(archive, self.root / "source")

    def test_missing_driver_source_is_rejected(self):
        archive = self.archive([("repo/other/file", b"outside", None)])
        with self.assertRaisesRegex(ValueError, "no iOS driver source"):
            driver.extract_sources(archive, self.root / "source")


if __name__ == "__main__":
    unittest.main()
